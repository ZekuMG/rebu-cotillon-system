from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import unicodedata
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
STOPWORDS = {
    "con", "sin", "para", "por", "del", "las", "los", "una", "uno", "varios", "varias",
    "colores", "color", "unidad", "unidades", "caja", "pack", "art", "cm", "mts", "metro",
    "metros", "modelo", "modelos", "premium", "economica", "economico", "liso", "lisa",
}


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def tokens(value: str) -> list[str]:
    result = []
    for token in normalize(value).split():
        if token in STOPWORDS or re.fullmatch(r"x?\d+[a-z]*", token):
            continue
        if len(token) >= 3:
            result.append(token)
    return result


def run_ocr(tesseract: Path, path: Path) -> tuple[str, str]:
    process = subprocess.run(
        [str(tesseract), str(path), "stdout", "-l", "eng", "--psm", "11"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
        timeout=90,
        check=False,
    )
    return str(path), process.stdout.strip()


def fuzzy_contains(target: str, candidates: set[str]) -> bool:
    if target in candidates:
        return True
    if len(target) < 5:
        return False
    return any(abs(len(target) - len(candidate)) <= 2 and SequenceMatcher(None, target, candidate).ratio() >= 0.78 for candidate in candidates)


def score_title(title: str, ocr_text: str, idf: dict[str, float]) -> dict:
    title_tokens = list(dict.fromkeys(tokens(title)))
    ocr_tokens = set(tokens(ocr_text))
    matched = [token for token in title_tokens if fuzzy_contains(token, ocr_tokens)]
    total = sum(idf.get(token, 1.0) for token in title_tokens) or 1.0
    overlap = sum(idf.get(token, 1.0) for token in matched) / total
    phrase = SequenceMatcher(None, normalize(title), normalize(ocr_text)).ratio() if ocr_text else 0.0
    score = 0.88 * overlap + 0.12 * phrase
    return {"score": round(score, 6), "overlap": round(overlap, 6), "matched_tokens": matched}


def load_rgb(path: Path) -> Image.Image:
    with Image.open(path) as source:
        image = source.convert("RGBA")
    canvas = Image.new("RGBA", image.size, (255, 255, 255, 255))
    canvas.alpha_composite(image)
    return canvas.convert("RGB")


def thumbnail(path: Path, size: tuple[int, int]) -> Image.Image:
    image = load_rgb(path)
    image.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", size, "white")
    canvas.paste(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
    return canvas


def clip(value: str, length: int = 38) -> str:
    return value if len(value) <= length else value[: length - 1] + "…"


def make_sheets(rows: list[dict], output_dir: Path, page_size: int = 14) -> list[str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default()
    cell_w, image_h, label_h = 270, 188, 76
    row_h = image_h + label_h
    outputs = []
    for page, start in enumerate(range(0, len(rows), page_size), 1):
        subset = rows[start : start + page_size]
        sheet = Image.new("RGB", (cell_w * 4, 34 + row_h * len(subset)), "#ededed")
        draw = ImageDraw.Draw(sheet)
        for col, label in enumerate(("ORIGINAL", "OCR 1", "OCR 2", "OCR 3")):
            draw.text((col * cell_w + 8, 10), label, fill="black", font=font)
        for index, row in enumerate(subset):
            top = 34 + index * row_h
            paths = [Path(row["source"])] + [Path(candidate["path"]) for candidate in row["candidates"][:3]]
            for col, path in enumerate(paths):
                left = col * cell_w
                sheet.paste(thumbnail(path, (cell_w - 8, image_h - 8)), (left + 4, top + 4))
                if col == 0:
                    line1 = f'{row["id"]} {clip(row["title"])}'
                    line2 = row["status"]
                    line3 = ""
                else:
                    candidate = row["candidates"][col - 1]
                    line1 = clip(path.name)
                    line2 = f's={candidate["score"]:.2f} tokens={",".join(candidate["matched_tokens"])}'
                    line3 = clip(normalize(candidate["ocr"]), 42)
                draw.text((left + 6, top + image_h + 4), line1, fill="black", font=font)
                draw.text((left + 6, top + image_h + 22), line2, fill="#333333", font=font)
                if line3:
                    draw.text((left + 6, top + image_h + 40), line3, fill="#555555", font=font)
            draw.line((0, top + row_h - 1, cell_w * 4, top + row_h - 1), fill="#999999")
        destination = output_dir / f"ocr-matches-{page:02d}.jpg"
        sheet.save(destination, quality=90, optimize=True)
        outputs.append(str(destination))
    return outputs


def classify(best: dict, second: dict) -> str:
    margin = best["score"] - second["score"]
    if best["overlap"] >= 0.72 and margin >= 0.15:
        return "strong"
    if best["overlap"] >= 0.48 and margin >= 0.10:
        return "probable"
    if best["overlap"] >= 0.28:
        return "possible"
    return "review"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive-dir", type=Path, required=True)
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--tesseract", type=Path, required=True)
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    selection = json.loads(args.selection.read_text(encoding="utf-8"))
    targets = selection["targets"]
    archive_paths = sorted(path for path in args.archive_dir.rglob("*") if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS)

    cache_path = args.output_dir / "ocr-cache.json"
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    missing = [path for path in archive_paths if str(path) not in cache]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(run_ocr, args.tesseract, path) for path in missing]
        for completed, future in enumerate(as_completed(futures), 1):
            path, text = future.result()
            cache[path] = text
            if completed % 25 == 0:
                cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")

    token_frequency = Counter()
    for target in targets:
        token_frequency.update(set(tokens(target["title"])))
    idf = {token: math.log((1 + len(targets)) / (1 + count)) + 1 for token, count in token_frequency.items()}

    rows = []
    for target in targets:
        candidates = []
        for path in archive_paths:
            ocr_text = cache[str(path)]
            score = score_title(target["title"], ocr_text, idf)
            candidates.append({"path": str(path), "ocr": ocr_text, **score})
        candidates.sort(key=lambda item: item["score"], reverse=True)
        rows.append({
            "id": str(target["id"]),
            "title": target["title"],
            "source": target["source_file"],
            "status": classify(candidates[0], candidates[1]),
            "candidates": candidates[:5],
        })

    report = {
        "archive_image_count": len(archive_paths),
        "target_count": len(rows),
        "automatic_status_counts": dict(Counter(row["status"] for row in rows)),
        "matches": rows,
    }
    report_path = args.output_dir / "ocr-match-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    sheet_paths = make_sheets(rows, args.output_dir / "qa")
    print(json.dumps({"report": str(report_path), "sheets": sheet_paths, "counts": report["automatic_status_counts"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
