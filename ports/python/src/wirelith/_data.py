# SPDX-License-Identifier: MIT

"""The data that ships with the package: icon names and font metrics (copied from spec/data
by scripts/sync_data.py)."""

from __future__ import annotations

import json
from functools import cache
from importlib import resources
from typing import Any

FONT_NAMES = ("mono", "sans", "serif")
FONT_WEIGHTS = (400, 500, 600, 700)


def _read(*parts: str) -> Any:
    path = resources.files(__package__).joinpath("data", *parts)
    return json.loads(path.read_text(encoding="utf-8"))


@cache
def icon_names() -> tuple[str, ...]:
    """Every icon name, in the order of spec/data/icons.json."""
    names = _read("icon-names.json")
    return tuple(names)


@cache
def icon_name_set() -> frozenset[str]:
    """Every icon name, for lookups."""
    return frozenset(icon_names())


@cache
def font_table(font: str, weight: int) -> dict[str, Any]:
    """The metrics table for a font and weight, as in spec/data/fonts."""
    data: dict[str, Any] = _read("fonts", f"{font}-{weight}.json")
    return data
