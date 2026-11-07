from __future__ import annotations

import argparse
import json
import zipfile
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--audit-dir", type=Path, required=True)
    parser.add_argument("--approved-zip", type=Path, required=True)
    parser.add_argument("--verified-archive-matches", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    report = json.loads(args.report.read_text(encoding="utf-8"))
    with zipfile.ZipFile(args.approved_zip) as archive:
        approved_ids = {
            Path(name).stem
            for name in archive.namelist()
            if Path(name).suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
        }

    archive_done_ids: set[str] = set()
    if args.verified_archive_matches:
        verified = json.loads(args.verified_archive_matches.read_text(encoding="utf-8"))
        archive_done_ids = {
            str(item["candidate_id"])
            for item in verified["rows"]
            if item.get("high_confidence")
        }

    records = [
        *report["confirmed_needs_correction"],
        *report["needs_format_normalization"],
    ]
    targets = []
    skipped = []
    for record in records:
        product_id = str(record["id"])
        local_file = args.audit_dir / record["local_file"]
        item = {
            "id": product_id,
            "title": record["title"],
            "source_file": str(local_file.resolve()),
            "status": record["status"],
            "reasons": record.get("reasons", record.get("reason", "")),
            "current_image": record["current_image"],
        }
        if product_id in approved_ids or product_id in archive_done_ids:
            item["excluded_reason"] = (
                "previously_approved_94_image_batch"
                if product_id in approved_ids
                else "high_confidence_match_in_user_corrected_archive"
            )
            skipped.append(item)
        else:
            targets.append(item)

    payload = {
        "specification": report["edit_specification"],
        "source_report": str(args.report.resolve()),
        "approved_zip": str(args.approved_zip.resolve()),
        "summary": {
            "usable_existing_photos": len(records),
            "previously_approved_excluded": len(skipped),
            "approved_zip_ids_in_scope": sum(item["excluded_reason"] == "previously_approved_94_image_batch" for item in skipped),
            "corrected_archive_ids_in_scope": sum(item["excluded_reason"] == "high_confidence_match_in_user_corrected_archive" for item in skipped),
            "candidate_targets_before_archive_matching": len(targets),
        },
        "targets": targets,
        "excluded": skipped,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
