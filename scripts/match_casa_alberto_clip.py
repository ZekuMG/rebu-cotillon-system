from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "output" / ".deps" / "clip"))

import torch
from PIL import Image, ImageDraw, ImageFont
from transformers import CLIPModel, CLIPProcessor


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


def load_rgb(path: Path) -> Image.Image:
    with Image.open(path) as source:
        image = source.convert("RGBA")
    white = Image.new("RGBA", image.size, (255, 255, 255, 255))
    white.alpha_composite(image)
    return white.convert("RGB")


def embed(paths: list[Path], model: CLIPModel, processor: CLIPProcessor, batch_size: int = 12) -> torch.Tensor:
    vectors = []
    for start in range(0, len(paths), batch_size):
        batch_paths = paths[start : start + batch_size]
        images = [load_rgb(path) for path in batch_paths]
        inputs = processor(images=images, return_tensors="pt")
        with torch.inference_mode():
            features = model.get_image_features(**inputs)
            if not isinstance(features, torch.Tensor):
                features = features.pooler_output
            features = features / features.norm(dim=-1, keepdim=True)
        vectors.append(features.cpu())
        print(f"embedded {min(start + batch_size, len(paths))}/{len(paths)}", flush=True)
    return torch.cat(vectors, dim=0)


def thumbnail(path: Path, size: tuple[int, int]) -> Image.Image:
    image = load_rgb(path)
    image.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", size, "white")
    canvas.paste(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
    return canvas


def clip_text(text: str, length: int = 34) -> str:
    return text if len(text) <= length else text[: length - 1] + "…"


def sheets(rows: list[dict], output_dir: Path, page_size: int = 14) -> list[str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default()
    cell_w, image_h, label_h = 285, 200, 58
    row_h = image_h + label_h
    output_paths = []
    for page_number, start in enumerate(range(0, len(rows), page_size), 1):
        page_rows = rows[start : start + page_size]
        sheet = Image.new("RGB", (cell_w * 4, 34 + row_h * len(page_rows)), "#eeeeee")
        draw = ImageDraw.Draw(sheet)
        for col, title in enumerate(("ORIGINAL", "CANDIDATO 1", "CANDIDATO 2", "CANDIDATO 3")):
            draw.text((col * cell_w + 8, 10), title, fill="black", font=font)
        for row_index, row in enumerate(page_rows):
            top = 34 + row_index * row_h
            paths = [Path(row["source"])] + [Path(candidate["path"]) for candidate in row["candidates"][:3]]
            for col, path in enumerate(paths):
                left = col * cell_w
                sheet.paste(thumbnail(path, (cell_w - 8, image_h - 8)), (left + 4, top + 4))
                if col == 0:
                    label = f'{row["id"]} {clip_text(row["title"])}'
                    detail = ""
                else:
                    candidate = row["candidates"][col - 1]
                    label = clip_text(path.name)
                    detail = f'cos={candidate["similarity"]:.4f}'
                draw.text((left + 6, top + image_h + 4), label, fill="black", font=font)
                draw.text((left + 6, top + image_h + 22), detail, fill="#333333", font=font)
            draw.line((0, top + row_h - 1, cell_w * 4, top + row_h - 1), fill="#999999")
        destination = output_dir / f"clip-matches-{page_number:02d}.jpg"
        sheet.save(destination, quality=91, optimize=True)
        output_paths.append(str(destination))
    return output_paths


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive-dir", type=Path, required=True)
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--model", default="openai/clip-vit-base-patch32")
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    selection = json.loads(args.selection.read_text(encoding="utf-8"))
    archive_paths = sorted(
        path for path in args.archive_dir.rglob("*") if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    )
    source_paths = [Path(target["source_file"]) for target in selection["targets"]]

    processor = CLIPProcessor.from_pretrained(args.model, local_files_only=True)
    model = CLIPModel.from_pretrained(args.model, local_files_only=True)
    model.eval()

    print("Embedding archive", flush=True)
    archive_vectors = embed(archive_paths, model, processor)
    print("Embedding target originals", flush=True)
    source_vectors = embed(source_paths, model, processor)
    similarities = source_vectors @ archive_vectors.T

    rows = []
    for row_index, target in enumerate(selection["targets"]):
        values, indexes = torch.topk(similarities[row_index], k=min(12, len(archive_paths)))
        candidates = [
            {"path": str(archive_paths[int(index)]), "similarity": round(float(value), 6)}
            for value, index in zip(values, indexes)
        ]
        rows.append(
            {
                "id": str(target["id"]),
                "title": target["title"],
                "source": str(source_paths[row_index]),
                "candidates": candidates,
            }
        )

    report = {"archive_image_count": len(archive_paths), "target_count": len(rows), "model": args.model, "matches": rows}
    report_path = args.output_dir / "clip-match-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    csv_path = args.output_dir / "clip-match-report.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["id", "title", "candidate", "similarity"])
        for row in rows:
            candidate = row["candidates"][0]
            writer.writerow([row["id"], row["title"], candidate["path"], candidate["similarity"]])

    sheet_paths = sheets(rows, args.output_dir / "qa")
    print(json.dumps({"report": str(report_path), "csv": str(csv_path), "sheets": sheet_paths}, ensure_ascii=False))


if __name__ == "__main__":
    main()
