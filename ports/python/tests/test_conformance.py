# SPDX-License-Identifier: MIT

"""Runs the conformance suite's tree and diagnostics cases in-process, without Node.

Each case folder in conformance/cases holds input.wirelith, diagnostics.json, and, when they
apply, tree.json and options.json. Trees are compared as JSON data and diagnostics by code,
severity, line and column, as the suite's runner does.
"""

import json
import unittest
from pathlib import Path
from typing import Any

from wirelith import parse, validate
from wirelith._js import to_json

CASES = Path(__file__).resolve().parents[3] / "conformance" / "cases"


def _essential(ds: list[dict[str, Any]]) -> list[tuple[Any, ...]]:
    return [(d["code"], d["severity"], d["line"], d["column"]) for d in ds]


def _data(v: Any) -> Any:
    """JSON data with every number as a float, so 2 and 2.0 compare equal."""
    return json.loads(json.dumps(to_json(v)), parse_int=float)


@unittest.skipUnless(CASES.is_dir(), "the conformance cases are not next to this package")
class ConformanceTest(unittest.TestCase):
    def test_cases(self) -> None:
        names = sorted(p.name for p in CASES.iterdir() if p.is_dir())
        self.assertGreater(len(names), 0)
        for name in names:
            folder = CASES / name
            # Decode as the runner's commands do: invalid UTF-8 becomes U+FFFD.
            source = (folder / "input.wirelith").read_bytes().decode("utf-8", "replace")
            options_path = folder / "options.json"
            options = json.loads(options_path.read_text(encoding="utf-8")) if options_path.exists() else {}
            with self.subTest(case=name, kind="diagnostics"):
                want = json.loads((folder / "diagnostics.json").read_text(encoding="utf-8"))
                got = validate(
                    source, options.get("themes"), options.get("defaultTheme"), screen=options.get("screen")
                )
                self.assertEqual(_essential(got), _essential(want))
            tree_path = folder / "tree.json"
            if tree_path.exists():
                with self.subTest(case=name, kind="tree"):
                    want_tree = json.loads(tree_path.read_text(encoding="utf-8"))
                    self.assertEqual(_data(parse(source)["tree"]), _data(want_tree))


if __name__ == "__main__":
    unittest.main()
