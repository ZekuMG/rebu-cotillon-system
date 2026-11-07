from __future__ import annotations

import argparse
import csv
import json
from datetime import date
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument("--archive-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    selection = json.loads(args.selection.read_text(encoding="utf-8"))
    archive_files = sorted(path for path in args.archive_dir.rglob("*") if path.is_file())

    pending = []
    for target in selection["targets"]:
        pending.append(
            {
                "id": str(target["id"]),
                "title": target["title"],
                "source_file": target["source_file"],
                "status": "pending_edit",
                "reason": "No exact, correctly finished match found in IMAGENES.rar",
                "required_changes": {
                    "remove_casa_alberto_watermark": True,
                    "remove_green_or_red_quantity_circle": True,
                    "white_background": True,
                    "canvas_ratio": "5:4",
                    "output_size_px": "3000x2400",
                    "dpi": 300,
                    "product_occupancy_approx_percent": 47,
                    "preserve_exact_product_identity": True,
                },
            }
        )

    report = {
        "audit_date": date.today().isoformat(),
        "scope": "Casa Alberto first batch, Z to T",
        "archive": str(args.archive_dir.resolve()),
        "archive_file_count": len(archive_files),
        "target_count": len(pending),
        "already_done_exact_count": 0,
        "pending_edit_count": len(pending),
        "counting_rule": "Only an exact product/variant/presentation with a correctly finished image counts as already done. Similar categories or alternate SKUs are rejected.",
        "already_done": [],
        "pending": pending,
        "notable_near_matches_rejected": [
            {
                "target_id": "2941",
                "archive_file": "213.jpg",
                "reason": "Blue cups, but different cup construction/design and the 590 cc Bellacup presentation cannot be verified.",
            },
            {
                "target_id": "3315",
                "archive_files": ["214214.png", "54745.png", "9268_1.jpeg"],
                "reason": "They are Fulbito products, but chocolate, peanut or black alfajor variants—not the caramel-filled turron shown by the target.",
            },
            {
                "target_ids": ["1285", "1284", "1283"],
                "reason": "The archive contains crowns/tiaras, but not the same wording, color and strass design as the three target SKUs.",
            },
            {
                "target_group": "themed cups and candles",
                "reason": "The archive contains banners/toppers for some of the same themes, but they are different products and therefore do not count.",
            },
        ],
    }

    json_path = args.output_dir / "final-audit.json"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    csv_path = args.output_dir / "final-audit.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "id",
                "title",
                "status",
                "source_file",
                "remove_green_or_red_circle",
                "remove_watermark",
                "white_background",
                "output_size",
                "dpi",
                "product_occupancy_percent",
            ]
        )
        for item in pending:
            changes = item["required_changes"]
            writer.writerow(
                [
                    item["id"],
                    item["title"],
                    item["status"],
                    item["source_file"],
                    "yes",
                    "yes",
                    "yes",
                    changes["output_size_px"],
                    changes["dpi"],
                    changes["product_occupancy_approx_percent"],
                ]
            )

    summary_path = args.output_dir / "AUDIT-SUMMARY.md"
    summary_path.write_text(
        "\n".join(
            [
                "# Auditoría IMAGENES.rar — Casa Alberto Z→T",
                "",
                f"- Imágenes revisadas en el RAR: {len(archive_files)}",
                f"- Productos objetivo: {len(pending)}",
                "- Coincidencias exactas y correctamente terminadas: 0",
                f"- Pendientes de edición: {len(pending)}",
                "",
                "Se aplicó un criterio conservador: los productos parecidos, otras variantes, otros sabores, otros tamaños y otros artículos de la misma temática no se contaron como coincidencias.",
                "",
                "Para todos los pendientes se debe eliminar por completo el círculo verde o rojo de cantidad, además de la marca de agua de Casa Alberto, y reconstruir el fondo blanco.",
            ]
        ),
        encoding="utf-8",
    )

    print(json.dumps({"json": str(json_path), "csv": str(csv_path), "summary": str(summary_path), "counts": {"done": 0, "pending": len(pending)}}, ensure_ascii=False))


if __name__ == "__main__":
    main()
