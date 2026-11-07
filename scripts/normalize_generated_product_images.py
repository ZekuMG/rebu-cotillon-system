from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


CANVAS = (3000, 2400)
OCCUPANCY = 0.47


def subject_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    rgb = np.asarray(image.convert("RGB"), dtype=np.int16)
    # ImageGen produces a nearly-white studio background. Keep subtle product
    # highlights but ignore the white canvas and very faint edge shadows.
    distance = np.max(np.abs(rgb - 255), axis=2)
    mask = distance > 18
    if not mask.any():
        raise ValueError("no non-white subject detected")

    ys, xs = np.where(mask)
    pad = max(8, round(min(image.size) * 0.012))
    return (
        max(0, int(xs.min()) - pad),
        max(0, int(ys.min()) - pad),
        min(image.width, int(xs.max()) + pad + 1),
        min(image.height, int(ys.max()) + pad + 1),
    )


def normalize(source: Path, destination: Path) -> dict:
    with Image.open(source) as opened:
        image = opened.convert("RGB")
    bbox = subject_bbox(image)
    crop = image.crop(bbox)
    max_size = (round(CANVAS[0] * OCCUPANCY), round(CANVAS[1] * OCCUPANCY))
    scale = min(max_size[0] / crop.width, max_size[1] / crop.height)
    size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
    crop = crop.resize(size, Image.Resampling.LANCZOS)

    canvas = Image.new("RGB", CANVAS, "white")
    position = ((CANVAS[0] - size[0]) // 2, (CANVAS[1] - size[1]) // 2)
    canvas.paste(crop, position)
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination, format="PNG", dpi=(300, 300), optimize=True)
    return {
        "source": str(source.resolve()),
        "output": str(destination.resolve()),
        "bbox": bbox,
        "placed_size": size,
        "position": position,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip outputs that already exist and are at least as new as their source.",
    )
    args = parser.parse_args()

    rows, failures, skipped = [], [], []
    for source in sorted(args.input_dir.glob("*.png"), key=lambda path: int(path.stem)):
        destination = args.output_dir / source.name
        if (
            args.skip_existing
            and destination.exists()
            and destination.stat().st_mtime_ns >= source.stat().st_mtime_ns
        ):
            skipped.append(str(destination.resolve()))
            continue
        try:
            rows.append(normalize(source, destination))
        except Exception as exc:  # continue the batch and report exact failures
            failures.append({"source": str(source.resolve()), "error": str(exc)})

    report = {
        "canvas": CANVAS,
        "occupancy": OCCUPANCY,
        "processed": len(rows),
        "skipped": len(skipped),
        "failed": len(failures),
        "rows": rows,
        "skipped_outputs": skipped,
        "failures": failures,
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "normalization-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"processed": len(rows), "skipped": len(skipped), "failed": len(failures)}))


if __name__ == "__main__":
    main()
