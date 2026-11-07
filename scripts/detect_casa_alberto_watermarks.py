from __future__ import annotations

import argparse
import io
import json
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps


TESSERACT = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")


def normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.casefold())


def tesseract(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    result = subprocess.run(
        [str(TESSERACT), "stdin", "stdout", "-l", "eng", "--psm", "11"],
        input=buffer.getvalue(),
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
        timeout=25,
    )
    return result.stdout.decode("utf-8", errors="ignore")


def variants(path: Path) -> list[Image.Image]:
    with Image.open(path) as source:
        image = source.convert("RGB")
    image.thumbnail((1100, 1100), Image.Resampling.LANCZOS)
    gray = ImageOps.grayscale(image)
    gray = ImageOps.autocontrast(gray, cutoff=1)
    gray = ImageEnhance.Contrast(gray).enhance(2.2)
    gray = gray.filter(ImageFilter.SHARPEN)
    return [
        gray,
        gray.rotate(-31, expand=True, fillcolor=255),
        gray.rotate(31, expand=True, fillcolor=255),
    ]


def inspect(record: dict, root: Path) -> dict:
    path = root / record["local_file"]
    texts = []
    try:
        for image in variants(path):
            texts.append(tesseract(image))
    except Exception as error:
        return {"id": record["id"], "status": "error", "error": str(error), "texts": texts}

    joined = "\n".join(texts)
    compact = normalize(joined)
    detected = any(token in compact for token in ("casaalber", "cotilloncasa", "casaalberto", "casaiberto"))
    return {
        "id": record["id"],
        "status": "detected" if detected else "not_detected",
        "text": joined[:2000],
        "normalized": compact[:2000],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--analysis", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    if not TESSERACT.exists():
        raise SystemExit(f"No se encontró Tesseract: {TESSERACT}")

    analysis = json.loads(args.analysis.read_text(encoding="utf-8"))
    root = args.analysis.parent
    candidates = [
        record
        for record in analysis["records"]
        if record["is_active"]
        and record["linked_to_casa_alberto"]
        and "casa_alberto_source_format" not in record["issues"]
    ]

    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(inspect, record, root): record for record in candidates}
        for number, future in enumerate(as_completed(futures), 1):
            result = future.result()
            source = futures[future]
            results.append({**result, "title": source["title"], "local_file": source["local_file"], "width": source["width"], "height": source["height"]})
            if number % 50 == 0 or number == len(candidates):
                print(f"OCR {number}/{len(candidates)}", flush=True)

    results.sort(key=lambda item: int(item["id"]) if str(item["id"]).isdigit() else str(item["id"]))
    report = {
        "candidate_count": len(candidates),
        "watermark_detected": sum(item["status"] == "detected" for item in results),
        "errors": sum(item["status"] == "error" for item in results),
        "results": results,
    }
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("candidate_count", "watermark_detected", "errors")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
