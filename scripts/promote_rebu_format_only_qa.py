from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path


REJECTED = {
    "149": "background removal deleted most of the transparent package",
    "153": "background removal deleted most of the transparent package",
    "183": "transparent mold plate was lost; only molded figures remain",
    "184": "transparent mold plate is heavily fragmented",
    "186": "transparent mold plate was lost; only molded figures remain",
    "193": "transparent mold plate is heavily fragmented",
    "198": "transparent mold plate has missing corners and edges",
    "199": "transparent mold plate was mostly removed",
    "201": "transparent mold plate was lost; only the figure remains",
    "205": "transparent mold plate was lost; only molded figures remain",
    "206": "transparent mold plate has missing corners and edges",
    "257": "inventory title says x5 but source shows one package",
    "295": "coupler product was removed; only printed logos remain",
    "312": "inventory title says x10 but source shows an uncounted bulk bowl",
    "316": "inventory title says x10 but source shows an uncounted bulk bowl",
    "317": "inventory title says x1 but source shows many sugar flowers",
    "318": "inventory title says x10 but source shows an uncounted bulk bowl",
    "378": "inventory title says cups x10 but source shows one cup",
    "513": "inventory title says cups x10 but source shows one cup",
    "514": "inventory title says cups x10 but source shows one cup",
    "516": "inventory title says cups x10 but source shows one cup",
    "517": "inventory title says cups x10 but source shows one cup",
    "519": "inventory title says cups x10 but source shows one cup",
    "520": "inventory title says cups x10 but source shows one cup",
    "521": "inventory title says cups x10 but source shows one cup",
    "576": "inventory title says alfajores x10 but source shows one wrapper",
    "612": "green promotional quantity circle remains",
    "1108": "banner segmentation retained only one letter",
    "1189": "single smoke-flare listing shows five units",
    "1192": "single smoke-flare listing shows five units",
    "1220": "source does not show the listed welcome-football poster",
    "1318": "premix listing shows only prepared macarons, not the retail product",
    "1409": "inventory says x10 while the visible ring quantity does not match",
    "1551": "inventory title says trays x10 but source shows one tray",
    "1749": "inventory title says trays x10 but source shows one tray",
    "1808": "retail container is cropped and incomplete",
    "1880": "tip-set segmentation destroyed most of the product",
    "1881": "cake-tool set segmentation destroyed most of the product",
    "1928": "tip-set segmentation retained only small fragments",
    "2006": "spatula-set segmentation retained only one fragment",
    "2198": "costume accessory segmentation is incomplete",
    "2292": "inventory title says trays x10 but source shows one tray",
    "2591": "green promotional quantity circle remains",
    "2823": "inventory title says alfajores x5 but source shows one wrapper",
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--destination-dir", type=Path, required=True)
    parser.add_argument("--staging-dir", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    payload = json.loads(args.selection.read_text(encoding="utf-8"))
    targets = [
        target
        for target in payload["pending_targets"]
        if target["status"] == "needs_format_normalization"
    ]
    workspace = args.selection.resolve().parents[2]
    args.destination_dir.mkdir(parents=True, exist_ok=True)

    approved: list[dict] = []
    rejected: list[dict] = []
    failures: list[dict] = []

    for target in targets:
        product_id = str(target["id"])
        destination = (args.destination_dir / f"{product_id}.png").resolve()
        if workspace not in destination.parents:
            raise RuntimeError(f"unsafe destination outside workspace: {destination}")

        if product_id in REJECTED:
            if destination.exists():
                destination.unlink()
            if args.staging_dir:
                staged = (args.staging_dir / f"{product_id}.png").resolve()
                if workspace in staged.parents and staged.exists():
                    staged.unlink()
            rejected.append(
                {
                    "id": product_id,
                    "title": target["title"],
                    "reason": REJECTED[product_id],
                }
            )
            continue

        source = args.source_dir / f"{product_id}.png"
        if not source.exists():
            failures.append(
                {"id": product_id, "title": target["title"], "error": "source missing"}
            )
            continue
        shutil.copy2(source, destination)
        approved.append(
            {
                "id": product_id,
                "title": target["title"],
                "source": str(source.resolve()),
                "output": str(destination),
            }
        )

    report = {
        "reviewed": len(targets),
        "approved": len(approved),
        "rejected": len(rejected),
        "failed": len(failures),
        "approved_rows": approved,
        "rejected_rows": rejected,
        "failures": failures,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("reviewed", "approved", "rejected", "failed")}))


if __name__ == "__main__":
    main()
