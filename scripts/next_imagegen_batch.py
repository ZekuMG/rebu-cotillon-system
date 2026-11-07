from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument("--raw-dir", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=8)
    parser.add_argument("--workspace-alias", type=Path)
    args = parser.parse_args()

    selection = json.loads(args.selection.read_text(encoding="utf-8"))
    items = []
    for target in selection["targets"]:
        if target["status"] != "confirmed_needs_correction":
            continue
        destination = args.raw_dir / f'{target["id"]}.png'
        if destination.exists():
            continue
        source_path = Path(target["source_file"])
        destination_path = destination.resolve()
        if args.workspace_alias:
            workspace = Path.cwd().resolve()
            source_path = args.workspace_alias / source_path.resolve().relative_to(workspace)
            destination_path = args.workspace_alias / destination_path.relative_to(workspace)
        items.append(
            {
                "id": str(target["id"]),
                "title": target["title"],
                "source_file": str(source_path),
                "destination": str(destination_path),
            }
        )
        if len(items) >= args.limit:
            break
    print(json.dumps(items, ensure_ascii=False))


if __name__ == "__main__":
    main()
