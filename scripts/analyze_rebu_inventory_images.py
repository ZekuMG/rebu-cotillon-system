from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "output" / ".deps" / "opencv"))

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


CASA_ALBERTO_SOURCE_SIZES = {(530, 398), (341, 256)}


def decode(path: Path) -> np.ndarray:
    data = np.fromfile(path, dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("cannot_decode")
    return image


def color_badges(image: np.ndarray) -> list[dict]:
    height, width = image.shape[:2]
    scale = min(1.0, 900 / max(height, width))
    if scale < 1:
        image = cv2.resize(image, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)
    height, width = image.shape[:2]
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    masks = {
        "green": cv2.inRange(hsv, (32, 95, 80), (96, 255, 255)),
        "red": cv2.bitwise_or(
            cv2.inRange(hsv, (0, 110, 80), (12, 255, 255)),
            cv2.inRange(hsv, (168, 110, 80), (179, 255, 255)),
        ),
    }
    kernel = np.ones((5, 5), np.uint8)
    results = []
    image_area = height * width
    for color, mask in masks.items():
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
        count, _, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
        for index in range(1, count):
            x, y, component_width, component_height, area = [int(value) for value in stats[index]]
            area_ratio = area / max(1, image_area)
            box_ratio = component_width / max(1, component_height)
            box_fill = area / max(1, component_width * component_height)
            center_x = (x + component_width / 2) / width
            center_y = (y + component_height / 2) / height
            if not (0.003 <= area_ratio <= 0.12):
                continue
            if not (0.58 <= box_ratio <= 1.72):
                continue
            if box_fill < 0.42:
                continue
            if center_x > 0.46 or center_y > 0.48:
                continue
            results.append(
                {
                    "color": color,
                    "x": x,
                    "y": y,
                    "width": component_width,
                    "height": component_height,
                    "area_ratio": round(area_ratio, 6),
                    "box_fill": round(box_fill, 6),
                    "center": [round(center_x, 4), round(center_y, 4)],
                }
            )
    return sorted(results, key=lambda item: item["area_ratio"], reverse=True)


def black_metrics(image: np.ndarray) -> dict:
    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    dark = gray < 28
    near_dark = gray < 50
    border_width = max(2, round(min(height, width) * 0.06))
    border = np.concatenate(
        [
            near_dark[:border_width, :].ravel(),
            near_dark[-border_width:, :].ravel(),
            near_dark[:, :border_width].ravel(),
            near_dark[:, -border_width:].ravel(),
        ]
    )
    return {
        "dark_fraction": round(float(dark.mean()), 6),
        "near_dark_fraction": round(float(near_dark.mean()), 6),
        "dark_border_fraction": round(float(border.mean()), 6),
    }


def load_rgb(path: Path) -> Image.Image:
    with Image.open(path) as source:
        image = source.convert("RGBA")
    canvas = Image.new("RGBA", image.size, "white")
    canvas.alpha_composite(image)
    return canvas.convert("RGB")


def qa_sheets(records: list[dict], root: Path, destination: Path, prefix: str, page_size: int = 30) -> list[str]:
    destination.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default()
    columns = 5
    rows = page_size // columns
    cell_width, image_height, label_height = 260, 210, 68
    outputs = []
    for page_number, start in enumerate(range(0, len(records), page_size), 1):
        page = records[start : start + page_size]
        sheet = Image.new("RGB", (columns * cell_width, rows * (image_height + label_height)), "#e5e7eb")
        draw = ImageDraw.Draw(sheet)
        for index, record in enumerate(page):
            row, column = divmod(index, columns)
            left, top = column * cell_width, row * (image_height + label_height)
            path = root / record["local_file"]
            image = load_rgb(path)
            image.thumbnail((cell_width - 10, image_height - 10), Image.Resampling.LANCZOS)
            sheet.paste(image, (left + (cell_width - image.width) // 2, top + (image_height - image.height) // 2))
            title = record["title"] if len(record["title"]) <= 34 else record["title"][:33] + "…"
            reasons = ",".join(record["issues"])
            draw.text((left + 5, top + image_height + 4), f'#{record["id"]} {title}', fill="black", font=font)
            draw.text((left + 5, top + image_height + 23), reasons[:42], fill="#991b1b", font=font)
            draw.text((left + 5, top + image_height + 42), f'{record["width"]}x{record["height"]}', fill="#374151", font=font)
            draw.rectangle((left, top, left + cell_width - 1, top + image_height + label_height - 1), outline="#9ca3af")
        output = destination / f"{prefix}-{page_number:02d}.jpg"
        sheet.save(output, quality=90, optimize=True)
        outputs.append(str(output))
    return outputs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    root = args.manifest.parent
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))

    records = []
    decode_errors = []
    for number, product in enumerate(manifest["products"], 1):
        if not product.get("local_file"):
            continue
        path = root / product["local_file"]
        try:
            image = decode(path)
            height, width = image.shape[:2]
            badges = color_badges(image)
            black = black_metrics(image)
            aspect_ratio = width / max(1, height)
            issues = []
            confidence = "review"
            if (width, height) in CASA_ALBERTO_SOURCE_SIZES:
                issues.extend(["casa_alberto_source_format", "watermark_likely"])
                confidence = "high"
            if badges:
                colors = sorted({item["color"] for item in badges})
                issues.extend([f"{color}_quantity_circle" for color in colors])
                confidence = "high" if (width, height) in CASA_ALBERTO_SOURCE_SIZES else "medium"
            if black["near_dark_fraction"] >= 0.36 and black["dark_border_fraction"] >= 0.28:
                issues.append("black_background_or_panel")
                confidence = "high" if (width, height) in CASA_ALBERTO_SOURCE_SIZES else "medium"
            if abs(aspect_ratio - 1.25) > 0.025:
                issues.append("not_5_to_4")

            records.append(
                {
                    "id": product["id"],
                    "title": product["title"],
                    "brand": product.get("brand", ""),
                    "is_active": product.get("is_active", True),
                    "linked_to_casa_alberto": product.get("linked_to_casa_alberto", False),
                    "current_image": product.get("current_image", ""),
                    "local_file": product["local_file"],
                    "width": width,
                    "height": height,
                    "aspect_ratio": round(aspect_ratio, 6),
                    "badges": badges,
                    **black,
                    "issues": issues,
                    "confidence": confidence,
                }
            )
        except Exception as error:
            decode_errors.append({"id": product["id"], "title": product["title"], "error": str(error)})
        if number % 500 == 0:
            print(f"ANALIZADAS {number}/{len(manifest['products'])}", flush=True)

    active = [record for record in records if record["is_active"]]
    high_priority = [
        record
        for record in active
        if any(
            issue in record["issues"]
            for issue in (
                "casa_alberto_source_format",
                "green_quantity_circle",
                "red_quantity_circle",
                "black_background_or_panel",
            )
        )
    ]
    source_format = [record for record in active if "casa_alberto_source_format" in record["issues"]]
    circles = [
        record
        for record in active
        if "green_quantity_circle" in record["issues"] or "red_quantity_circle" in record["issues"]
    ]
    black = [record for record in active if "black_background_or_panel" in record["issues"]]
    nonstandard = [record for record in active if "not_5_to_4" in record["issues"]]
    square_badges_outside_source = [
        record
        for record in circles
        if "casa_alberto_source_format" not in record["issues"]
        and abs(record["width"] - record["height"]) <= max(2, round(record["width"] * 0.02))
    ]
    missing_active = [
        product
        for product in manifest["products"]
        if product.get("is_active", True) and not product.get("current_image")
    ]

    summary = {
        "inventory_products": len(manifest["products"]),
        "active_products": sum(1 for product in manifest["products"] if product.get("is_active", True)),
        "active_with_downloaded_image": len(active),
        "active_without_image": len(missing_active),
        "decode_errors": len(decode_errors),
        "high_priority_unique": len(high_priority),
        "casa_alberto_source_format": len(source_format),
        "green_or_red_circle": len(circles),
        "black_background_or_panel": len(black),
        "not_5_to_4": len(nonstandard),
        "square_badges_outside_source": len(square_badges_outside_source),
        "issue_counts": dict(Counter(issue for record in active for issue in record["issues"])),
    }

    report = {
        "summary": summary,
        "counting_rule": "High priority means an active product whose current image has a Casa Alberto source-size signature, a detected green/red upper-left badge, or a likely black background/panel.",
        "high_priority": high_priority,
        "missing_active": missing_active,
        "decode_errors": decode_errors,
        "records": records,
    }
    report_path = args.output_dir / "analysis.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    csv_path = args.output_dir / "needs-correction.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["id", "title", "brand", "issues", "confidence", "width", "height", "current_image"])
        for record in high_priority:
            writer.writerow(
                [
                    record["id"],
                    record["title"],
                    record["brand"],
                    ";".join(record["issues"]),
                    record["confidence"],
                    record["width"],
                    record["height"],
                    record["current_image"],
                ]
            )

    missing_path = args.output_dir / "missing-images.csv"
    with missing_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["id", "title", "brand", "linked_to_casa_alberto", "casa_alberto_source_image"])
        for product in missing_active:
            writer.writerow(
                [
                    product["id"],
                    product["title"],
                    product.get("brand", ""),
                    product.get("linked_to_casa_alberto", False),
                    product.get("casa_alberto_source_image", ""),
                ]
            )

    qa_paths = qa_sheets(high_priority, root, args.output_dir / "qa", "needs-correction")
    square_qa_paths = qa_sheets(
        square_badges_outside_source,
        root,
        args.output_dir / "qa-square-badges",
        "square-badges",
    )
    print(json.dumps({"summary": summary, "report": str(report_path), "csv": str(csv_path), "missing": str(missing_path), "qa_pages": len(qa_paths), "square_badge_qa_pages": len(square_qa_paths)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
