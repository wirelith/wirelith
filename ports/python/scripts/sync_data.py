#!/usr/bin/env python3
# SPDX-License-Identifier: MIT

"""Copies the specification's data into the Python package.

    python3 ports/python/scripts/sync_data.py           write the copies
    python3 ports/python/scripts/sync_data.py --check   fail if they are out of date

The font tables are copied byte for byte. The icon names are the keys of `names` in
spec/data/icons.json, in order, written as a JSON list; the drawings are not needed.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SPEC = ROOT / "spec" / "data"
OUT = ROOT / "ports" / "python" / "src" / "wirelith" / "data"


def expected() -> dict[Path, bytes]:
    """Every file the package's data folder should hold, with its content."""
    files: dict[Path, bytes] = {}
    for src in sorted((SPEC / "fonts").glob("*.json")):
        files[OUT / "fonts" / src.name] = src.read_bytes()
    icons = json.loads((SPEC / "icons.json").read_text(encoding="utf-8"))
    names = list(icons["names"].keys())
    files[OUT / "icon-names.json"] = (json.dumps(names, indent=1) + "\n").encode("utf-8")
    return files


def main(argv: list[str]) -> int:
    check = "--check" in argv
    files = expected()
    stale = 0
    for path, content in files.items():
        rel = path.relative_to(ROOT)
        if check:
            current = path.read_bytes() if path.exists() else None
            if current != content:
                print(f"{rel} is out of date; run python3 ports/python/scripts/sync_data.py", file=sys.stderr)
                stale += 1
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
    # Files in the data folder that the specification no longer has.
    for path in sorted(OUT.rglob("*.json")):
        if path not in files:
            rel = path.relative_to(ROOT)
            if check:
                print(
                    f"{rel} is not in spec/data; run python3 ports/python/scripts/sync_data.py",
                    file=sys.stderr,
                )
                stale += 1
            else:
                path.unlink()
    if stale > 0:
        return 1
    print("python data: up to date." if check else f"python data: written to {OUT.relative_to(ROOT)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
