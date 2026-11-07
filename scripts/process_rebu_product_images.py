from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "output" / ".deps" / "rembg"))
sys.path.insert(1, str(Path(__file__).resolve().parents[1] / "output" / ".deps" / "opencv"))

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from rembg import new_session, remove
from scipy import ndimage


CANVAS_SIZE = (3000, 2400)
OCCUPANCY = 0.47


def load_rgba(path: Path) -> Image.Image:
    with Image.open(path) as source:
        return source.convert("RGBA")


def template_watermark_mask(template: Image.Image, background: str) -> np.ndarray:
    rgb = np.asarray(template.convert("RGB"), dtype=np.float32)
    maximum = rgb.max(axis=2)
    minimum = rgb.min(axis=2)
    saturation = np.divide(maximum - minimum, maximum, out=np.zeros_like(maximum), where=maximum > 0)
    gray = rgb.mean(axis=2)
    height, width = gray.shape
    yy, xx = np.mgrid[:height, :width]
    # Fixed Casa Alberto watermark axis, scaled to either known source size.
    x1, y1 = width * 0.035, height * 0.91
    x2, y2 = width * 0.965, height * 0.10
    denominator = np.hypot(y2 - y1, x2 - x1)
    distance = np.abs((y2 - y1) * xx - (x2 - x1) * yy + x2 * y1 - y2 * x1) / denominator
    band = distance < height * 0.105
    if background == "black":
        lettering = (saturation < 0.22) & (gray > 48)
    else:
        lettering = (saturation < 0.20) & (gray > 75) & (gray < 251)
    mask = (band & lettering).astype(np.uint8) * 255
    kernel = np.ones((3, 3), np.uint8)
    return cv2.dilate(mask, kernel, iterations=1)


def preclean_source(
    source: Image.Image,
    record: dict,
    reasons: str,
    template_dir: Path | None,
) -> tuple[Image.Image, dict]:
    rgb = np.asarray(source.convert("RGB"))
    height, width = rgb.shape[:2]
    mask = np.zeros((height, width), dtype=np.uint8)
    dark_border = float(record.get("dark_border_fraction", 0))
    background = "black" if dark_border > 0.55 else "white"
    watermark_applied = False

    if template_dir and ("casa" in reasons.lower() or "watermark" in reasons.lower()):
        template_path = template_dir / f"{width}x{height}-{background}-median.png"
        if template_path.exists():
            template = load_rgba(template_path)
            mask = cv2.bitwise_or(mask, template_watermark_mask(template, background))
            watermark_applied = True

    badge_boxes = []
    if "green_or_red" in reasons or "casa" in reasons.lower() or "watermark" in reasons.lower():
        for badge in record.get("badges", []):
            center_x, center_y = badge.get("center", (1, 1))
            if center_x >= 0.31 or center_y >= 0.31:
                continue
            x = int(badge["x"])
            y = int(badge["y"])
            box_width = int(badge["width"])
            box_height = int(badge["height"])
            pad = max(3, round(min(width, height) * 0.018))
            left, top = max(0, x - pad), max(0, y - pad)
            right, bottom = min(width, x + box_width + pad), min(height, y + box_height + pad)
            cv2.rectangle(mask, (left, top), (right, bottom), 255, -1)
            badge_boxes.append((left, top, right, bottom))

    if not mask.any():
        return source, {
            "watermark_precleaned": False,
            "badge_boxes_precleaned": [],
            "preclean_mask_ratio": 0.0,
        }
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    cleaned = cv2.inpaint(bgr, mask, 3, cv2.INPAINT_TELEA)
    cleaned_rgb = cv2.cvtColor(cleaned, cv2.COLOR_BGR2RGB)
    return Image.fromarray(cleaned_rgb, "RGB").convert("RGBA"), {
        "watermark_precleaned": watermark_applied,
        "badge_boxes_precleaned": badge_boxes,
        "preclean_mask_ratio": round(float((mask > 0).mean()), 6),
    }


def badge_color_mask(image: Image.Image) -> np.ndarray:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    maximum = rgb.max(axis=2)
    minimum = rgb.min(axis=2)
    delta = maximum - minimum
    saturation = np.divide(delta, maximum, out=np.zeros_like(delta), where=maximum > 0)
    red = rgb[:, :, 0]
    green = rgb[:, :, 1]
    blue = rgb[:, :, 2]
    green_mask = (green > 0.36) & (green > red * 1.18) & (green > blue * 1.12) & (saturation > 0.42)
    red_mask = (red > 0.48) & (red > green * 1.22) & (red > blue * 1.18) & (saturation > 0.46)
    mask = green_mask | red_mask
    height, width = mask.shape
    region = np.zeros_like(mask)
    region[: int(height * 0.43), : int(width * 0.43)] = True
    return mask & region


def remove_quantity_badge(alpha: np.ndarray, source: Image.Image) -> tuple[np.ndarray, bool]:
    color = badge_color_mask(source)
    labels, count = ndimage.label(alpha > 24)
    if count == 0 or color.sum() < max(20, color.size * 0.00035):
        return alpha, False

    overlapping = labels[color]
    values, counts = np.unique(overlapping[overlapping > 0], return_counts=True)
    changed = False
    output = alpha.copy()
    if len(values):
        order = np.argsort(counts)[::-1]
        for index in order[:3]:
            label = values[index]
            component = labels == label
            ys, xs = np.where(component)
            if not len(xs):
                continue
            if xs.mean() < alpha.shape[1] * 0.43 and ys.mean() < alpha.shape[0] * 0.43:
                output[component] = 0
                changed = True

    if not changed:
        # The badge may have been split into text and circle fragments. Remove only
        # a compact region surrounding the detected upper-left colored mark.
        ys, xs = np.where(color)
        if len(xs):
            pad = max(4, int(min(source.size) * 0.025))
            left, right = max(0, xs.min() - pad), min(alpha.shape[1], xs.max() + pad + 1)
            top, bottom = max(0, ys.min() - pad), min(alpha.shape[0], ys.max() + pad + 1)
            output[top:bottom, left:right] = 0
            changed = True
    return output, changed


def cleaned_cutout(source: Image.Image, session, remove_badge: bool) -> tuple[Image.Image, dict]:
    result = remove(
        source,
        session=session,
        alpha_matting=False,
        post_process_mask=True,
    ).convert("RGBA")
    rgba = np.asarray(result).copy()
    alpha = rgba[:, :, 3]
    badge_removed = False
    if remove_badge:
        alpha, badge_removed = remove_quantity_badge(alpha, source)
    rgba[:, :, 3] = alpha

    visible = alpha > 18
    coverage = float(visible.mean())
    if not visible.any():
        raise ValueError("background removal produced an empty subject")
    ys, xs = np.where(visible)
    bbox = (int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1))
    cutout = Image.fromarray(rgba, "RGBA").crop(bbox)
    return cutout, {
        "mask_coverage": round(coverage, 6),
        "badge_removed": badge_removed,
        "source_bbox": bbox,
    }


def place_on_canvas(cutout: Image.Image) -> tuple[Image.Image, dict]:
    max_width = int(CANVAS_SIZE[0] * OCCUPANCY)
    max_height = int(CANVAS_SIZE[1] * OCCUPANCY)
    scale = min(max_width / cutout.width, max_height / cutout.height)
    size = (max(1, round(cutout.width * scale)), max(1, round(cutout.height * scale)))
    resized = cutout.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", CANVAS_SIZE, "white")
    position = ((CANVAS_SIZE[0] - size[0]) // 2, (CANVAS_SIZE[1] - size[1]) // 2)
    canvas.alpha_composite(resized, position)
    return canvas.convert("RGB"), {
        "placed_size": size,
        "position": position,
        "width_occupancy": round(size[0] / CANVAS_SIZE[0], 6),
        "height_occupancy": round(size[1] / CANVAS_SIZE[1], 6),
    }


def make_contact_sheets(rows: list[dict], destination_dir: Path, page_size: int = 20) -> list[str]:
    font = ImageFont.load_default()
    cell_w, image_h, label_h = 430, 300, 52
    row_h = image_h + label_h
    destination_dir.mkdir(parents=True, exist_ok=True)
    outputs = []
    for page, start in enumerate(range(0, len(rows), page_size), 1):
        page_rows = rows[start : start + page_size]
        sheet = Image.new("RGB", (cell_w * 2, row_h * len(page_rows)), "#ececec")
        draw = ImageDraw.Draw(sheet)
        for row_index, row in enumerate(page_rows):
            top = row_index * row_h
            for col, key in enumerate(("source_file", "output_file")):
                image = load_rgba(Path(row[key])).convert("RGB")
                image.thumbnail((cell_w - 12, image_h - 12), Image.Resampling.LANCZOS)
                left = col * cell_w
                sheet.paste(image, (left + (cell_w - image.width) // 2, top + 6 + (image_h - image.height) // 2))
                label = ("ORIGINAL" if col == 0 else "EDITADA") + f'  #{row["id"]} {row["title"][:42]}'
                draw.text((left + 8, top + image_h + 8), label, fill="black", font=font)
                if col == 1:
                    draw.text((left + 8, top + image_h + 25), f"badge_removed={row['badge_removed']}", fill="#333", font=font)
            draw.line((0, top + row_h - 1, cell_w * 2, top + row_h - 1), fill="#aaa")
        destination = destination_dir / f"qa-{page:03d}.jpg"
        sheet.save(destination, quality=91, optimize=True)
        outputs.append(str(destination))
    return outputs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--model-home", type=Path, required=True)
    parser.add_argument("--model", default="u2netp")
    parser.add_argument("--analysis", type=Path)
    parser.add_argument("--template-dir", type=Path)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--status")
    args = parser.parse_args()

    payload = json.loads(args.selection.read_text(encoding="utf-8"))
    analysis_by_id = {}
    if args.analysis:
        analysis = json.loads(args.analysis.read_text(encoding="utf-8"))
        analysis_by_id = {str(item["id"]): item for item in analysis["records"]}
    targets = payload["targets"]
    if args.status:
        targets = [item for item in targets if item.get("status") == args.status]
    targets = targets[args.offset :]
    if args.limit is not None:
        targets = targets[: args.limit]
    args.output_dir.mkdir(parents=True, exist_ok=True)
    args.model_home.mkdir(parents=True, exist_ok=True)
    os.environ["U2NET_HOME"] = str(args.model_home.resolve())
    session = new_session(args.model)

    rows = []
    failures = []
    for index, target in enumerate(targets, 1):
        try:
            source = load_rgba(Path(target["source_file"]))
            reason = str(target.get("reasons", ""))
            analysis_record = analysis_by_id.get(str(target["id"]), {})
            source, preclean = preclean_source(
                source,
                analysis_record,
                reason,
                args.template_dir,
            )
            remove_badge = "green_or_red" in reason or "casa" in reason.lower() or "watermark" in reason.lower()
            cutout, cleanup = cleaned_cutout(source, session, remove_badge)
            if cleanup["mask_coverage"] > 0.93:
                raise ValueError(f"background removal retained {cleanup['mask_coverage']:.1%} of image")
            final, placement = place_on_canvas(cutout)
            output_file = args.output_dir / f'{target["id"]}.png'
            final.save(output_file, format="PNG", dpi=(300, 300), optimize=True)
            rows.append(
                {
                    "id": str(target["id"]),
                    "title": target["title"],
                    "source_file": target["source_file"],
                    "output_file": str(output_file.resolve()),
                    "reasons": reason,
                    **preclean,
                    **cleanup,
                    **placement,
                }
            )
        except Exception as exc:
            failures.append({"id": str(target["id"]), "title": target["title"], "error": str(exc)})
        print(f"processed {index}/{len(targets)} ok={len(rows)} failed={len(failures)}", flush=True)

    report = {
        "model": args.model,
        "canvas": CANVAS_SIZE,
        "occupancy": OCCUPANCY,
        "processed": len(targets),
        "succeeded": len(rows),
        "failed": len(failures),
        "rows": rows,
        "failures": failures,
    }
    report_path = args.output_dir.parent / f"processing-report-{args.offset}-{len(targets)}.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if rows:
        make_contact_sheets(rows, args.output_dir.parent / f"qa-{args.offset}-{len(rows)}")
    print(json.dumps({"report": str(report_path), "succeeded": len(rows), "failed": len(failures)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
