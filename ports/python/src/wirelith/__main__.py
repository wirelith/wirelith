# SPDX-License-Identifier: MIT

"""The command line, for the conformance runner and for scripts.

    python -m wirelith tree         read a source on stdin, write its syntax tree as JSON
    python -m wirelith diagnostics  read a source on stdin, write its diagnostics as JSON

Render options are read as JSON from the WIRELITH_OPTIONS environment variable. `themes`,
`defaultTheme` and `screen` change the diagnostics; the others are checked but not used.
"""

from __future__ import annotations

import json
import os
import re
import sys
from typing import Any

from . import _js
from .api import parse, validate

_USAGE = "usage: python -m wirelith tree|diagnostics"
_PREFIX = re.compile(r"[A-Za-z][A-Za-z0-9_-]*")


def _options() -> dict[str, Any]:
    raw = os.environ.get("WIRELITH_OPTIONS")
    if not raw:
        return {}
    options = json.loads(raw)
    if not isinstance(options, dict):
        raise ValueError("WIRELITH_OPTIONS must be a JSON object")
    # Core checks idPrefix even when it only validates, and fails on a bad one.
    prefix = options.get("idPrefix")
    if "idPrefix" in options and _PREFIX.fullmatch(_js.to_string(prefix)) is None:
        raise ValueError(f'idPrefix "{_js.to_string(prefix)}" must match [A-Za-z][A-Za-z0-9_-]*')
    screen = options.get("screen")
    if screen is not None and not isinstance(screen, str):
        raise ValueError(
            f'The screen option names "{_js.to_string(screen)}", which is not a screen in this source'
        )
    return options


def _write(value: Any) -> None:
    text = json.dumps(_js.to_json(value), ensure_ascii=False, separators=(",", ":"))
    sys.stdout.buffer.write(text.encode("utf-8") + b"\n")


def main(argv: list[str]) -> int:
    if len(argv) != 1 or argv[0] not in ("tree", "diagnostics"):
        print(_USAGE, file=sys.stderr)
        return 2
    # Invalid UTF-8 is replaced with U+FFFD, as decoding for the web does.
    source = sys.stdin.buffer.read().decode("utf-8", "replace")
    try:
        if argv[0] == "tree":
            _write(parse(source)["tree"])
        else:
            options = _options()
            _write(
                validate(
                    source, options.get("themes"), options.get("defaultTheme"), screen=options.get("screen")
                )
            )
    except ValueError as e:
        print(f"wirelith: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
