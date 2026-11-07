from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


def load_rgb(path: Path) -> Image.Image:
    with Image.open(path) as source:
        image = source.convert("RGBA")
    white = Image.new("RGBA", image.size, (255, 255, 255, 255))
    white.alpha_composite(image)
    return white.convert("RGB")


def subject_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    sample = image.copy()
    sample.thumbnail((720, 720), Image.Resampling.LANCZOS)
    array = np.asarray(sample, dtype=np.int16)

    border = np.concatenate(
        [array[0], array[-1], array[:, 0], array[:, -1]], axis=0
    )
    background = np.median(border, axis=0)
    color_distance = np.max(np.abs(array - background), axis=2)
    darkness = 255 - np.min(array, axis=2)
    mask = (color_distance > 16) | (darkness > 24)

    # Ignore isolated compression noise near the canvas edge.
    rows = np.where(mask.mean(axis=1) > 0.006)[0]
    cols = np.where(mask.mean(axis=0) > 0.006)[0]
    if not len(rows) or not len(cols):
        return (0, 0, image.width, image.height)

    sx = image.width / sample.width
    sy = image.height / sample.height
    left = max(0, int(cols[0] * sx))
    top = max(0, int(rows[0] * sy))
    right = min(image.width, int(math.ceil((cols[-1] + 1) * sx)))
    bottom = min(image.height, int(math.ceil((rows[-1] + 1) * sy)))
    if right - left < image.width * 0.06 or bottom - top < image.height * 0.06:
        return (0, 0, image.width, image.height)
    return (left, top, right, bottom)


def letterbox(image: Image.Image, size: int, padding: int = 2) -> Image.Image:
    target = Image.new("RGB", (size, size), "white")
    inner = size - padding * 2
    copy = image.copy()
    copy.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    x = (size - copy.width) // 2
    y = (size - copy.height) // 2
    target.paste(copy, (x, y))
    return target


def dct_basis(size: int) -> np.ndarray:
    x = np.arange(size)
    u = np.arange(size)[:, None]
    basis = np.cos((math.pi / size) * (x + 0.5) * u)
    basis[0] *= math.sqrt(1 / size)
    basis[1:] *= math.sqrt(2 / size)
    return basis


DCT_32 = dct_basis(32)


def binary_hash(values: np.ndarray) -> np.ndarray:
    flat = values.reshape(-1)
    return flat > np.median(flat)


def image_features(path: Path) -> dict[str, np.ndarray | tuple[int, int] | str]:
    image = load_rgb(path)
    bbox = subject_bbox(image)
    subject = image.crop(bbox)
    normalized = letterbox(subject, 64)
    rgb = np.asarray(normalized, dtype=np.float32) / 255.0
    gray = np.asarray(normalized.convert("L"), dtype=np.float32) / 255.0

    small = np.asarray(normalized.resize((32, 32), Image.Resampling.LANCZOS).convert("L"), dtype=np.float32)
    dct = DCT_32 @ small @ DCT_32.T
    phash = binary_hash(dct[:8, :8][1:])

    dhash_image = np.asarray(normalized.resize((17, 16), Image.Resampling.LANCZOS).convert("L"), dtype=np.int16)
    dhash = (dhash_image[:, 1:] > dhash_image[:, :-1]).reshape(-1)

    gx = np.abs(np.diff(gray, axis=1, prepend=gray[:, :1]))
    gy = np.abs(np.diff(gray, axis=0, prepend=gray[:1, :]))
    edges = np.clip(gx + gy, 0, 1)

    hist_parts = []
    for channel in range(3):
        hist, _ = np.histogram(rgb[:, :, channel], bins=16, range=(0, 1), density=False)
        hist_parts.append(hist.astype(np.float32))
    histogram = np.concatenate(hist_parts)
    histogram /= max(histogram.sum(), 1)

    return {
        "rgb": rgb,
        "gray": gray,
        "edges": edges,
        "phash": phash,
        "dhash": dhash,
        "hist": histogram,
        "size": image.size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def cosine_distance(a: np.ndarray, b: np.ndarray) -> float:
    av = a.reshape(-1).astype(np.float64)
    bv = b.reshape(-1).astype(np.float64)
    av -= av.mean()
    bv -= bv.mean()
    denominator = np.linalg.norm(av) * np.linalg.norm(bv)
    if denominator == 0:
        return 1.0
    return float(1 - np.dot(av, bv) / denominator)


def feature_distance(a: dict, b: dict) -> float:
    phash = float(np.mean(a["phash"] != b["phash"]))
    dhash = float(np.mean(a["dhash"] != b["dhash"]))
    gray = min(1.0, cosine_distance(a["gray"], b["gray"]) / 1.25)
    edges = min(1.0, cosine_distance(a["edges"], b["edges"]) / 1.25)
    hist = min(1.0, float(np.abs(a["hist"] - b["hist"]).sum()) / 1.25)
    rgb_mae = min(1.0, float(np.abs(a["rgb"] - b["rgb"]).mean()) / 0.45)
    return 0.27 * phash + 0.15 * dhash + 0.20 * gray + 0.18 * edges + 0.10 * hist + 0.10 * rgb_mae


def fit_thumbnail(path: Path, box: tuple[int, int]) -> Image.Image:
    image = load_rgb(path)
    image.thumbnail(box, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", box, "white")
    canvas.paste(image, ((box[0] - image.width) // 2, (box[1] - image.height) // 2))
    return canvas


def clipped(text: str, length: int = 34) -> str:
    return text if len(text) <= length else text[: length - 1] + "…"


def make_sheets(rows: list[dict], output_dir: Path, per_sheet: int = 20) -> list[str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default()
    cell_w, image_h, label_h = 250, 180, 50
    row_h = image_h + label_h
    headers = ["ORIGINAL", "CANDIDATO 1", "CANDIDATO 2", "CANDIDATO 3"]
    outputs = []

    for page, start in enumerate(range(0, len(rows), per_sheet), 1):
        page_rows = rows[start : start + per_sheet]
        sheet = Image.new("RGB", (cell_w * 4, 36 + row_h * len(page_rows)), "#ececec")
        draw = ImageDraw.Draw(sheet)
        for col, header in enumerate(headers):
            draw.text((col * cell_w + 8, 10), header, fill="black", font=font)

        for offset, row in enumerate(page_rows):
            top = 36 + offset * row_h
            paths = [Path(row["source"])] + [Path(item["path"]) for item in row["candidates"][:3]]
            for col, path in enumerate(paths):
                cell_x = col * cell_w
                thumb = fit_thumbnail(path, (cell_w - 8, image_h - 8))
                sheet.paste(thumb, (cell_x + 4, top + 4))
                if col == 0:
                    label = f'{row["id"]} {clipped(row["title"])}'
                    score_label = f'status={row["status"]}'
                else:
                    candidate = row["candidates"][col - 1]
                    label = clipped(Path(candidate["path"]).name)
                    score_label = f'score={candidate["score"]:.4f}'
                draw.text((cell_x + 6, top + image_h + 4), label, fill="black", font=font)
                draw.text((cell_x + 6, top + image_h + 20), score_label, fill="#333333", font=font)
            draw.line((0, top + row_h - 1, cell_w * 4, top + row_h - 1), fill="#999999")

        output_path = output_dir / f"matches-{page:02d}.jpg"
        sheet.save(output_path, quality=88, optimize=True)
        outputs.append(str(output_path))
    return outputs


def classify(best: float, second: float) -> str:
    margin = second - best
    if best <= 0.105:
        return "exact_or_near"
    if best <= 0.165 and margin >= 0.018:
        return "strong"
    if best <= 0.215 and margin >= 0.025:
        return "probable"
    return "review"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive-dir", type=Path, required=True)
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    payload = json.loads(args.selection.read_text(encoding="utf-8"))
    targets = payload["targets"]
    archive_files = sorted(
        path for path in args.archive_dir.rglob("*") if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    )

    archive_features = {}
    archive_errors = []
    dimensions = Counter()
    for path in archive_files:
        try:
            features = image_features(path)
            archive_features[path] = features
            dimensions[f'{features["size"][0]}x{features["size"][1]}'] += 1
        except Exception as exc:
            archive_errors.append({"path": str(path), "error": str(exc)})

    rows = []
    for target in targets:
        reference_paths = []
        for key in ("source_file", "final_output"):
            path = Path(target[key])
            if path.exists():
                reference_paths.append(path)
        references = [image_features(path) for path in reference_paths]

        candidates = []
        for path, features in archive_features.items():
            score = min(feature_distance(reference, features) for reference in references)
            candidates.append({"path": str(path), "score": round(score, 6)})
        candidates.sort(key=lambda item: item["score"])
        best = candidates[0]["score"]
        second = candidates[1]["score"] if len(candidates) > 1 else 1.0
        rows.append(
            {
                "id": str(target["id"]),
                "title": target["title"],
                "source": target["source_file"],
                "status": classify(best, second),
                "best_score": best,
                "margin": round(second - best, 6),
                "candidates": candidates[:5],
            }
        )

    report = {
        "archive_image_count": len(archive_files),
        "readable_archive_image_count": len(archive_features),
        "archive_errors": archive_errors,
        "target_count": len(targets),
        "dimension_counts": dict(dimensions.most_common()),
        "automatic_status_counts": dict(Counter(row["status"] for row in rows)),
        "matches": rows,
    }
    report_path = args.output_dir / "automatic-match-report.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    csv_path = args.output_dir / "automatic-match-report.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["id", "title", "status", "best_score", "margin", "candidate_1", "candidate_2", "candidate_3"])
        for row in rows:
            writer.writerow(
                [
                    row["id"],
                    row["title"],
                    row["status"],
                    row["best_score"],
                    row["margin"],
                    *[candidate["path"] for candidate in row["candidates"][:3]],
                ]
            )

    sheets = make_sheets(rows, args.output_dir / "qa")
    print(json.dumps({"report": str(report_path), "csv": str(csv_path), "sheets": sheets, "counts": report["automatic_status_counts"], "dimensions": report["dimension_counts"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
