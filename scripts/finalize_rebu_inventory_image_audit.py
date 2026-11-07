from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path


# Manually reviewed false positives among square images. Their red/green regions
# belong to the product or artwork and are not quantity badges.
FALSE_SQUARE_BADGE_IDS = {
    "242", "414", "416", "747", "1317", "1724", "1763", "1782", "1793",
    "1883", "1884", "1932", "1935", "2406", "2545", "2590", "2591",
    "2662", "2949", "3024", "3025",
}

# Manually reviewed square images whose black background/panel needs correction.
BLACK_BACKGROUND_OUTSIDE_SOURCE_IDS = {
    "568", "1218", "1406", "1455", "1655", "1748", "1792", "1813",
    "2026", "2197", "2201",
}


def is_test_product(product: dict) -> bool:
    return bool(re.search(r"test", str(product.get("title", "")), flags=re.IGNORECASE))


def write_csv(path: Path, rows: list[dict], columns: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--analysis", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    analysis = json.loads(args.analysis.read_text(encoding="utf-8"))
    products = {str(item["id"]): item for item in manifest["products"]}
    records = {str(item["id"]): item for item in analysis["records"]}

    production_active = [
        item for item in manifest["products"]
        if item.get("is_active", True) and not is_test_product(item)
    ]
    confirmed = []
    format_only = []
    missing = []
    broken = []

    for product in production_active:
        product_id = str(product["id"])
        if not product.get("current_image"):
            missing.append(
                {
                    "id": product_id,
                    "title": product["title"],
                    "brand": product.get("brand", ""),
                    "linked_to_casa_alberto": product.get("linked_to_casa_alberto", False),
                    "supplier_image_available": bool(product.get("casa_alberto_source_image")),
                    "supplier_image": product.get("casa_alberto_source_image", ""),
                    "status": "missing_image",
                }
            )
            continue
        if product.get("download_status") == "error":
            broken.append(
                {
                    "id": product_id,
                    "title": product["title"],
                    "brand": product.get("brand", ""),
                    "current_image": product.get("current_image", ""),
                    "error": product.get("download_error", ""),
                    "status": "broken_image_reference",
                }
            )
            continue

        record = records.get(product_id)
        if not record:
            broken.append(
                {
                    "id": product_id,
                    "title": product["title"],
                    "brand": product.get("brand", ""),
                    "current_image": product.get("current_image", ""),
                    "error": "not_analyzed",
                    "status": "broken_or_unread_image",
                }
            )
            continue

        source_format = "casa_alberto_source_format" in record["issues"]
        badge_detected = "green_quantity_circle" in record["issues"] or "red_quantity_circle" in record["issues"]
        square = abs(record["width"] - record["height"]) <= max(2, round(record["width"] * 0.02))
        reviewed_square_badge = badge_detected and square and product_id not in FALSE_SQUARE_BADGE_IDS
        reviewed_black = product_id in BLACK_BACKGROUND_OUTSIDE_SOURCE_IDS

        if source_format or reviewed_square_badge or reviewed_black:
            reasons = []
            if source_format:
                reasons.extend(["casa_alberto_watermark_or_source_format", "not_5_to_4"])
            if reviewed_square_badge:
                reasons.append("green_or_red_quantity_circle")
            if reviewed_black or "black_background_or_panel" in record["issues"]:
                reasons.append("black_background_or_panel")
            confirmed.append(
                {
                    "id": product_id,
                    "title": product["title"],
                    "brand": product.get("brand", ""),
                    "reasons": ";".join(dict.fromkeys(reasons)),
                    "width": record["width"],
                    "height": record["height"],
                    "current_image": product.get("current_image", ""),
                    "local_file": record["local_file"],
                    "status": "confirmed_needs_correction",
                }
            )
        else:
            format_only.append(
                {
                    "id": product_id,
                    "title": product["title"],
                    "brand": product.get("brand", ""),
                    "reason": "canvas_is_not_5_to_4",
                    "width": record["width"],
                    "height": record["height"],
                    "current_image": product.get("current_image", ""),
                    "local_file": record["local_file"],
                    "status": "needs_format_normalization",
                }
            )

    confirmed_ids = {item["id"] for item in confirmed}
    confirmed_records = [records[item_id] for item_id in confirmed_ids]
    visible_issue_counts = {
        "watermark_or_casa_source_format": sum(
            "casa_alberto_source_format" in item["issues"] for item in confirmed_records
        ),
        "green_or_red_quantity_circle_detected": sum(
            "green_quantity_circle" in item["issues"] or "red_quantity_circle" in item["issues"]
            for item in confirmed_records
        ),
        "black_background_or_panel": sum(
            "black_background_or_panel" in item["issues"] or item["id"] in BLACK_BACKGROUND_OUTSIDE_SOURCE_IDS
            for item in confirmed_records
        ),
    }

    summary = {
        "inventory_products_total": len(manifest["products"]),
        "active_products_total": sum(item.get("is_active", True) for item in manifest["products"]),
        "active_test_products_excluded": sum(
            item.get("is_active", True) and is_test_product(item) for item in manifest["products"]
        ),
        "production_active_products": len(production_active),
        "confirmed_visible_correction": len(confirmed),
        "format_only_normalization": len(format_only),
        "usable_photos_requiring_full_spec": len(confirmed) + len(format_only),
        "missing_images": len(missing),
        "broken_image_references": len(broken),
        "fully_compliant_5_to_4_photos": 0,
        "visible_issue_counts": visible_issue_counts,
    }

    edit_specification = {
        "remove_casa_alberto_watermark": True,
        "remove_green_or_red_quantity_circle": True,
        "replace_black_or_nonuniform_background_with_white": True,
        "canvas_ratio": "5:4",
        "output_size_px": "3000x2400",
        "dpi": 300,
        "product_occupancy_approx_percent": 47,
        "preserve_exact_product_identity": True,
    }

    report = {
        "summary": summary,
        "scope": "Rebu production active inventory, read-only audit",
        "edit_specification": edit_specification,
        "confirmed_needs_correction": confirmed,
        "needs_format_normalization": format_only,
        "missing_images": missing,
        "broken_image_references": broken,
    }
    report_path = args.output_dir / "final-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    write_csv(
        args.output_dir / "confirmed-needs-correction.csv",
        confirmed,
        ["id", "title", "brand", "reasons", "width", "height", "current_image", "local_file", "status"],
    )
    write_csv(
        args.output_dir / "format-normalization-only.csv",
        format_only,
        ["id", "title", "brand", "reason", "width", "height", "current_image", "local_file", "status"],
    )
    write_csv(
        args.output_dir / "missing-images-final.csv",
        missing,
        ["id", "title", "brand", "linked_to_casa_alberto", "supplier_image_available", "supplier_image", "status"],
    )
    write_csv(
        args.output_dir / "broken-image-references.csv",
        broken,
        ["id", "title", "brand", "current_image", "error", "status"],
    )

    summary_path = args.output_dir / "AUDIT-SUMMARY.md"
    summary_path.write_text(
        "\n".join(
            [
                "# Auditoría de imágenes del inventario Rebu",
                "",
                f"- Productos activos de producción: {summary['production_active_products']}",
                f"- Fotos con problemas visibles confirmados: {summary['confirmed_visible_correction']}",
                f"- Fotos que además requieren solo normalización a 5:4: {summary['format_only_normalization']}",
                f"- Fotos utilizables que requieren cumplir la especificación completa: {summary['usable_photos_requiring_full_spec']}",
                f"- Productos sin imagen: {summary['missing_images']}",
                f"- Referencias de imagen rotas: {summary['broken_image_references']}",
                "- Fotos ya compatibles con 5:4: 0",
                "",
                "## Problemas visibles dentro del grupo confirmado",
                "",
                f"- Marca de agua/formato fuente Casa Alberto: {visible_issue_counts['watermark_or_casa_source_format']}",
                f"- Círculo verde o rojo detectado: {visible_issue_counts['green_or_red_quantity_circle_detected']}",
                f"- Fondo negro o panel negro: {visible_issue_counts['black_background_or_panel']}",
                "",
                "La auditoría fue de solo lectura. No se modificaron productos, imágenes ni datos de Supabase.",
            ]
        ),
        encoding="utf-8",
    )
    print(json.dumps({"summary": summary, "report": str(report_path), "summary_file": str(summary_path)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
