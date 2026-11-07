from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


def load_rgb(path: Path) -> Image.Image:
    with Image.open(path) as source:
        image = source.convert("RGBA")
    white = Image.new("RGBA", image.size, "white")
    white.alpha_composite(image)
    return white.convert("RGB")


def thumb(path: Path, size: tuple[int, int]) -> Image.Image:
    image = load_rgb(path)
    image.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", size, "white")
    canvas.paste(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
    return canvas


def make_sheets(items: list[tuple[Path, str]], destination: Path, prefix: str, columns: int = 5, rows: int = 4) -> list[str]:
    destination.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default()
    cell_w, image_h, label_h = 250, 205, 54
    page_size = columns * rows
    outputs = []
    for page_number, start in enumerate(range(0, len(items), page_size), 1):
        page = items[start : start + page_size]
        sheet = Image.new("RGB", (columns * cell_w, rows * (image_h + label_h)), "#e8e8e8")
        draw = ImageDraw.Draw(sheet)
        for index, (path, label) in enumerate(page):
            row, col = divmod(index, columns)
            left, top = col * cell_w, row * (image_h + label_h)
            sheet.paste(thumb(path, (cell_w - 8, image_h - 8)), (left + 4, top + 4))
            display = label if len(label) <= 42 else label[:41] + "…"
            draw.text((left + 6, top + image_h + 4), display, fill="black", font=font)
            draw.rectangle((left, top, left + cell_w - 1, top + image_h + label_h - 1), outline="#999999")
        output = destination / f"{prefix}-{page_number:02d}.jpg"
        sheet.save(output, quality=92, optimize=True)
        outputs.append(str(output))
    return outputs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive-dir", type=Path, required=True)
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    archive_paths = sorted(path for path in args.archive_dir.rglob("*") if path.is_file() and path.suffix.lower() in EXTENSIONS)
    archive_items = [(path, path.name) for path in archive_paths]
    selection = json.loads(args.selection.read_text(encoding="utf-8"))
    target_items = [(Path(item["source_file"]), f'{item["id"]} {item["title"]}') for item in selection["targets"]]

    archive_sheets = make_sheets(archive_items, args.output_dir, "archive-index")
    target_sheets = make_sheets(target_items, args.output_dir, "target-index")
    print(json.dumps({"archive": archive_sheets, "targets": target_sheets}, ensure_ascii=False))


if __name__ == "__main__":
    main()
