# SPDX-License-Identifier: MIT

"""What each component accepts (spec section 5)."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from . import _js


@dataclass(frozen=True)
class ComponentSpec:
    """What one component accepts."""

    flags: tuple[str, ...]
    """Flags it defines."""
    attrs: tuple[str, ...]
    """Attributes it defines, besides the common ones."""
    label: bool
    """Whether its first string means something."""
    items: bool
    """Whether its first list means something."""
    children: bool
    """Whether it takes children."""


def _c(flags: list[str], attrs: list[str], label: bool, items: bool, children: bool) -> ComponentSpec:
    return ComponentSpec(tuple(flags), tuple(attrs), label, items, children)


_BOX = ["gap", "pad", "align", "justify"]

COMPONENTS: dict[str, ComponentSpec] = {
    "screen": _c(["phone", "tablet", "desktop"], ["size", "of", "state"], True, False, True),
    "row": _c(["wrap"], _BOX, False, False, True),
    "column": _c([], _BOX, False, False, True),
    "grid": _c([], ["cols", "gap", "pad"], False, False, True),
    "spacer": _c([], ["size"], False, False, False),
    "divider": _c([], [], False, False, False),
    "header": _c([], _BOX, False, False, True),
    "footer": _c([], _BOX, False, False, True),
    "sidebar": _c(["right"], [], False, False, True),
    "nav": _c(["vertical"], ["active"], False, True, True),
    "tabs": _c([], ["active"], False, True, True),
    "breadcrumbs": _c([], [], False, True, False),
    "h1": _c([], ["align"], True, False, False),
    "h2": _c([], ["align"], True, False, False),
    "h3": _c([], ["align"], True, False, False),
    "text": _c(["muted"], ["align", "lines"], True, False, False),
    "label": _c(["muted"], [], True, False, False),
    "button": _c(["primary", "secondary", "danger", "disabled", "sm", "lg"], ["icon"], True, False, False),
    "link": _c(["disabled"], [], True, False, False),
    "input": _c(["required", "disabled"], ["placeholder", "value", "type", "error"], True, False, False),
    "textarea": _c([], ["placeholder", "value", "rows"], True, False, False),
    "select": _c(["disabled"], ["value", "placeholder"], True, True, False),
    "checkbox": _c(["checked", "disabled"], [], True, False, False),
    "radio": _c(["disabled"], ["value"], True, True, False),
    "toggle": _c(["on", "disabled"], [], True, False, False),
    "table": _c([], ["rows"], True, True, True),
    "table-row": _c(["selected"], [], False, True, False),
    "list": _c(["ordered"], [], False, True, True),
    "item": _c(["active"], ["icon", "badge"], True, False, False),
    "card": _c([], ["pad", "gap"], True, False, True),
    "image": _c([], ["ratio"], True, False, False),
    "icon": _c(["sm", "lg"], [], True, False, False),
    "badge": _c(["primary", "danger", "success"], [], True, False, False),
    "avatar": _c(["sm", "lg"], [], True, False, False),
    "modal": _c(["open"], [], True, False, True),
    "drawer": _c(["open", "right", "left", "bottom"], [], True, False, True),
    "empty": _c([], [], True, False, True),
    "loading": _c([], [], True, False, False),
    "error": _c([], [], True, False, True),
    "note": _c([], ["for"], True, False, False),
}

COMMON_FLAGS: tuple[str, ...] = ("grow",)
"""Flags every element accepts (spec section 5.10)."""
COMMON_ATTRS: tuple[str, ...] = ("width", "height", "span")
"""Attributes every element accepts (spec section 5.10)."""

WRITTEN_NAMES: list[str] = [n for n in COMPONENTS if n != "table-row"]
"""Component names a source may write. `table-row` is written as `row`."""

OVERLAYS = frozenset(["modal", "drawer"])
SIZES = ("none", "xs", "sm", "md", "lg", "xl")
ALIGNS = ("start", "center", "end", "stretch")
JUSTIFIES = ("start", "center", "end", "between")
INPUT_TYPES = ("text", "password", "email", "number", "search", "date")

DEVICES: dict[str, tuple[int, int]] = {
    "phone": (390, 844),
    "tablet": (820, 1180),
    "desktop": (1280, 800),
}

SYNONYMS: dict[str, str] = {
    "textfield": "input",
    "textbox": "input",
    "field": "input",
    "dropdown": "select",
    "combobox": "select",
    "picker": "select",
    "navbar": "nav",
    "navigation": "nav",
    "menu": "nav",
    "menubar": "nav",
    "container": "column",
    "div": "column",
    "stack": "column",
    "vstack": "column",
    "hstack": "row",
    "paragraph": "text",
    "p": "text",
    "span": "text",
    "heading": "h1",
    "title": "h1",
    "img": "image",
    "picture": "image",
    "photo": "image",
    "switch": "toggle",
    "dialog": "modal",
    "popup": "modal",
    "sheet": "drawer",
    "panel": "drawer",
    "chip": "badge",
    "tag": "badge",
    "pill": "badge",
    "separator": "divider",
    "hr": "divider",
    "section": "card",
    "box": "card",
    "spinner": "loading",
    "alert": "error",
    "placeholder": "empty",
    "tab": "tabs",
    "crumbs": "breadcrumbs",
    "options": "radio",
    "textinput": "input",
    "password": "input",
    "menuitem": "item",
    "li": "item",
    "ul": "list",
    "ol": "list",
    "tr": "row",
    "td": "text",
}
"""Common names people write for a component, for "did you mean" hints (spec section 5)."""


def distance(a: str, b: str) -> int:
    """The edit distance between two strings, counted in UTF-16 code units as core does."""
    ua = _js.utf16_units(a)
    ub = _js.utf16_units(b)
    prev = list(range(len(ub) + 1))
    for i in range(1, len(ua) + 1):
        diag = prev[0]
        prev[0] = i
        for j in range(1, len(ub) + 1):
            up = prev[j]
            cost = 0 if ua[i - 1] == ub[j - 1] else 1
            prev[j] = min(up + 1, prev[j - 1] + 1, diag + cost)
            diag = up
    return prev[len(ub)]


def closest(word: str, candidates: Iterable[str]) -> str | None:
    """The closest candidate within a small distance, or None. Ties go to the earliest."""
    lower = word.lower()
    best: str | None = None
    best_d = max(2, len(_js.utf16_units(word)) // 3) + 1
    for c in candidates:
        d = distance(lower, c)
        if d < best_d:
            best = c
            best_d = d
    return best
