# SPDX-License-Identifier: MIT

"""Text measurement (spec section 11) with the metrics tables that ship with the spec."""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import cache

from . import _data, _js


@dataclass(frozen=True)
class _Table:
    upm: int
    ascent: int
    default: int
    advances: dict[int, int]


@cache
def _table(font: str, weight: int) -> _Table:
    raw = _data.font_table(font, weight)
    advances = {ord(ch[0]): int(adv) for ch, adv in raw["advances"].items() if ch}
    return _Table(int(raw["unitsPerEm"]), int(raw["ascent"]), int(raw["default"]), advances)


def r(x: float) -> float:
    """Rounds to the nearest 0.5, halves up (spec section 10.1): floor(2x + 0.5) / 2."""
    return _js.floor(2 * x + 0.5) / 2


@dataclass(frozen=True)
class Font:
    """A font, weight and size."""

    font: str
    weight: int
    size: float


def _units(text: str, t: _Table) -> int:
    """The width of a string on one line, in font units."""
    total = 0
    for ch in text:
        cp = ord(ch)
        if cp > 0xFFFF:
            total += 2 * t.default
        else:
            total += t.advances.get(cp, t.default)
    return total


def measure(text: str, f: Font) -> float:
    """The width of a string on one line, in pixels, rounded."""
    t = _table(f.font, f.weight)
    return r((float(_units(text, t)) * f.size) / t.upm)


def wrap(text: str, f: Font, width: float) -> tuple[list[str], bool]:
    """Wraps text greedily at spaces and line breaks (spec section 11).

    Returns the lines, and whether a word was wider than the line and had to be clipped.
    """
    lines: list[str] = []
    clipped = False
    for para in text.split("\n"):
        line = ""
        for word in para.split(" "):
            candidate = word if line == "" else f"{line} {word}"
            if line == "" or measure(candidate, f) <= width:
                line = candidate
            else:
                lines.append(line)
                line = word
            if measure(word, f) > width:
                clipped = True
        lines.append(line)
    return lines, clipped


def longest_word(text: str, f: Font) -> float:
    """The width of the widest word, for a text's minimum width."""
    w = 0.0
    for word in re.split(r"[ \n]", text):
        w = max(w, measure(word, f))
    return w


def line_width(text: str, f: Font) -> float:
    """The width of the widest line when the text is not wrapped."""
    w = 0.0
    for line in text.split("\n"):
        w = max(w, measure(line, f))
    return w
