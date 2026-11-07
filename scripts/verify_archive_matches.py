from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from audit_casa_alberto_archive import feature_distance, image_features


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    report = json.loads(args.report.read_text(encoding="utf-8"))
    feature_cache: dict[str, dict] = {}

    def features(path: str) -> dict:
        if path not in feature_cache:
            feature_cache[path] = image_features(Path(path))
        return feature_cache[path]

    verified = []
    for index, row in enumerate(report["rows"], 1):
        archive_path = row["archive_file"]
        candidate = row["candidates"][0]
        target_path = candidate["source_file"]
        archive_sha = hashlib.sha256(Path(archive_path).read_bytes()).hexdigest()
        target_sha = hashlib.sha256(Path(target_path).read_bytes()).hexdigest()
        distance = feature_distance(features(archive_path), features(target_path))
        same_sha = archive_sha == target_sha
        high_confidence = same_sha or (
            row["mutual_nearest"]
            and row["best_similarity"] >= 0.88
            and distance <= 0.18
        )
        verified.append(
            {
                **row,
                "candidate_id": candidate["id"],
                "candidate_title": candidate["title"],
                "same_sha256": same_sha,
                "visual_distance": round(distance, 6),
                "high_confidence": high_confidence,
            }
        )
        if index % 25 == 0:
            print(f"verified {index}/{len(report['rows'])}", flush=True)

    output = {
        "summary": {
            "archive_count": len(verified),
            "same_sha256": sum(item["same_sha256"] for item in verified),
            "high_confidence": sum(item["high_confidence"] for item in verified),
        },
        "rows": verified,
    }
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(output["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
