from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--analysis", type=Path, required=True)
    parser.add_argument("--audit-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--max-per-group", type=int, default=300)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    analysis = json.loads(args.analysis.read_text(encoding="utf-8"))
    groups: dict[str, list[Path]] = defaultdict(list)
    for record in analysis["records"]:
        if not record.get("is_active") or "casa_alberto_source_format" not in record.get("issues", []):
            continue
        background = "black" if record.get("dark_border_fraction", 0) > 0.55 else "white"
        key = f'{record["width"]}x{record["height"]}-{background}'
        groups[key].append(args.audit_dir / record["local_file"])

    report = {}
    for key, paths in sorted(groups.items()):
        selected = paths[: args.max_per_group]
        stack = []
        for path in selected:
            with Image.open(path) as source:
                stack.append(np.asarray(source.convert("RGB"), dtype=np.uint8))
        median = np.median(np.stack(stack, axis=0), axis=0).astype(np.uint8)
        output = args.output_dir / f"{key}-median.png"
        Image.fromarray(median, "RGB").save(output)
        report[key] = {"available": len(paths), "used": len(selected), "median": str(output)}

    (args.output_dir / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
