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
        images = [load_rgb(path) for path in paths[start : start + batch_size]]
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


def clipped(value: str, length: int = 38) -> str:
    return value if len(value) <= length else value[: length - 1] + "…"


def make_sheets(rows: list[dict], output_dir: Path, page_size: int = 12) -> list[str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default()
    cell_w, image_h, label_h = 300, 210, 60
    row_h = image_h + label_h
    paths = []
    for page, start in enumerate(range(0, len(rows), page_size), 1):
        page_rows = rows[start : start + page_size]
        sheet = Image.new("RGB", (cell_w * 4, 34 + row_h * len(page_rows)), "#ededed")
        draw = ImageDraw.Draw(sheet)
        for col, label in enumerate(("CORREGIDA DEL RAR", "CANDIDATO 1", "CANDIDATO 2", "CANDIDATO 3")):
            draw.text((col * cell_w + 8, 10), label, fill="black", font=font)
        for row_index, row in enumerate(page_rows):
            top = 34 + row_index * row_h
            candidates = row["candidates"][:3]
            image_paths = [Path(row["archive_file"])] + [Path(item["source_file"]) for item in candidates]
            for col, image_path in enumerate(image_paths):
                left = col * cell_w
                sheet.paste(thumbnail(image_path, (cell_w - 8, image_h - 8)), (left + 4, top + 4))
                if col == 0:
                    name = clipped(image_path.name)
                    detail = f'best={row["best_similarity"]:.3f} margin={row["margin"]:.3f}'
                else:
                    item = candidates[col - 1]
                    name = f'#{item["id"]} {clipped(item["title"])}'
                    detail = f'sim={item["similarity"]:.3f}'
                draw.text((left + 6, top + image_h + 4), name, fill="black", font=font)
                draw.text((left + 6, top + image_h + 22), detail, fill="#333333", font=font)
            draw.line((0, top + row_h - 1, cell_w * 4, top + row_h - 1), fill="#999999")
        destination = output_dir / f"archive-to-inventory-{page:02d}.jpg"
        sheet.save(destination, quality=91, optimize=True)
        paths.append(str(destination))
    return paths


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive-dir", type=Path, required=True)
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--model", default="openai/clip-vit-base-patch32")
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    selection = json.loads(args.selection.read_text(encoding="utf-8"))
    targets = selection["targets"]
    target_paths = [Path(item["source_file"]) for item in targets]
    archive_paths = sorted(
        path for path in args.archive_dir.rglob("*") if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    )

    processor = CLIPProcessor.from_pretrained(args.model, local_files_only=True)
    model = CLIPModel.from_pretrained(args.model, local_files_only=True)
    model.eval()

    print("Embedding corrected archive", flush=True)
    archive_vectors = embed(archive_paths, model, processor)
    print("Embedding Rebu inventory targets", flush=True)
    target_vectors = embed(target_paths, model, processor)
    similarities = archive_vectors @ target_vectors.T

    target_best_archive = similarities.argmax(dim=0)
    rows = []
    for archive_index, archive_path in enumerate(archive_paths):
        values, indexes = torch.topk(similarities[archive_index], k=min(5, len(targets)))
        candidates = []
        for value, index in zip(values, indexes):
            target = targets[int(index)]
            candidates.append(
                {
                    "id": str(target["id"]),
                    "title": target["title"],
                    "source_file": target["source_file"],
                    "similarity": round(float(value), 6),
                }
            )
        best = candidates[0]["similarity"]
        second = candidates[1]["similarity"] if len(candidates) > 1 else -1.0
        best_target_index = int(indexes[0])
        rows.append(
            {
                "archive_file": str(archive_path.resolve()),
                "best_similarity": best,
                "margin": round(best - second, 6),
                "mutual_nearest": int(target_best_archive[best_target_index]) == archive_index,
                "candidates": candidates,
            }
        )

    report = {
        "archive_count": len(archive_paths),
        "inventory_target_count": len(targets),
        "model": args.model,
        "rows": rows,
    }
    report_path = args.output_dir / "archive-to-inventory.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    with (args.output_dir / "archive-to-inventory.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["archive_file", "candidate_id", "candidate_title", "similarity", "margin", "mutual_nearest"])
        for row in rows:
            candidate = row["candidates"][0]
            writer.writerow(
                [
                    row["archive_file"], candidate["id"], candidate["title"],
                    row["best_similarity"], row["margin"], row["mutual_nearest"],
                ]
            )
    sheets = make_sheets(rows, args.output_dir / "qa")
    print(json.dumps({"report": str(report_path), "sheets": len(sheets)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
