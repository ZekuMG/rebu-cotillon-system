from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--skip-existing", action="store_true")
    args = parser.parse_args()

    selection = json.loads(args.selection.read_text(encoding="utf-8"))
    targets = [
        target
        for target in selection["pending_targets"]
        if target["status"] == "needs_format_normalization"
    ]

    args.output_dir.mkdir(parents=True, exist_ok=True)
    staged: list[dict] = []
    skipped: list[dict] = []
    failures: list[dict] = []

    for target in targets:
        source = Path(target["source_file"])
        destination = args.output_dir / f'{target["id"]}.png'
        if args.skip_existing and destination.exists():
            skipped.append({"id": target["id"], "output": str(destination.resolve())})
            continue
        try:
            with Image.open(source) as opened:
                opened.convert("RGB").save(destination, format="PNG", optimize=True)
            staged.append(
                {
                    "id": target["id"],
                    "title": target["title"],
                    "source": str(source.resolve()),
                    "output": str(destination.resolve()),
                }
            )
        except Exception as exc:
            failures.append(
                {"id": target["id"], "source": str(source.resolve()), "error": str(exc)}
            )

    report = {
        "eligible": len(targets),
        "staged": len(staged),
        "skipped": len(skipped),
        "failed": len(failures),
        "rows": staged,
        "skipped_rows": skipped,
        "failures": failures,
    }
    (args.output_dir / "format-only-staging-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "eligible": len(targets),
                "staged": len(staged),
                "skipped": len(skipped),
                "failed": len(failures),
            }
        )
    )


if __name__ == "__main__":
    main()
