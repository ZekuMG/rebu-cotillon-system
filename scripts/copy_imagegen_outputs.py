from __future__ import annotations

import argparse
import base64
import json
import shutil
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--payload-base64", required=True)
    args = parser.parse_args()
    payload = json.loads(base64.b64decode(args.payload_base64).decode("utf-8"))
    copied = []
    for item in payload:
        source = Path(item["source"])
        destination = Path(item["destination"])
        if not source.exists():
            raise FileNotFoundError(source)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        copied.append({"id": item["id"], "destination": str(destination)})
    print(json.dumps(copied, ensure_ascii=False))


if __name__ == "__main__":
    main()
