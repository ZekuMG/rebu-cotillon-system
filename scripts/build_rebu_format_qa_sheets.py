from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument("--image-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--page-size", type=int, default=20)
    args = parser.parse_args()

    selection = json.loads(args.selection.read_text(encoding="utf-8"))
    targets = [
        target
        for target in selection["pending_targets"]
        if target["status"] == "needs_format_normalization"
        and (args.image_dir / f'{target["id"]}.png').exists()
    ]

    columns = 4
    rows_per_page = math.ceil(args.page_size / columns)
    cell_w, image_h, label_h = 420, 330, 44
    cell_h = image_h + label_h
    font = ImageFont.load_default()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    pages: list[str] = []
    for page_index, start in enumerate(range(0, len(targets), args.page_size), 1):
        page_targets = targets[start : start + args.page_size]
        sheet = Image.new("RGB", (columns * cell_w, rows_per_page * cell_h), "#e8e8e8")
        draw = ImageDraw.Draw(sheet)
        for index, target in enumerate(page_targets):
            row, column = divmod(index, columns)
            left, top = column * cell_w, row * cell_h
            image_path = args.image_dir / f'{target["id"]}.png'
            with Image.open(image_path) as opened:
                image = opened.convert("RGB")
            image.thumbnail((cell_w - 16, image_h - 16), Image.Resampling.LANCZOS)
            sheet.paste(
                image,
                (
                    left + (cell_w - image.width) // 2,
                    top + (image_h - image.height) // 2,
                ),
            )
            label = f'#{target["id"]} {target["title"][:48]}'
            draw.text((left + 7, top + image_h + 7), label, fill="black", font=font)
            draw.rectangle((left, top, left + cell_w - 1, top + cell_h - 1), outline="#b0b0b0")

        output = args.output_dir / f"format-qa-{page_index:03d}.jpg"
        sheet.save(output, quality=92, optimize=True)
        pages.append(str(output.resolve()))

    report = {
        "targets": len(targets),
        "pages": len(pages),
        "page_size": args.page_size,
        "files": pages,
    }
    (args.output_dir / "contact-sheet-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"targets": len(targets), "pages": len(pages)}))


if __name__ == "__main__":
    main()
