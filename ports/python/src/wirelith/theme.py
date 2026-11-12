# SPDX-License-Identifier: MIT

"""Themes (spec section 9): the built-in themes, resolving a theme by name, and validating
every token, whether it comes from a source or from the host."""

from __future__ import annotations

import math
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from . import _js
from .parse import Diagnostic, diagnostic

_PAPER: dict[str, Any] = {
    "color.bg": "#f4f5f7",
    "color.surface": "#ffffff",
    "color.border": "#9aa1ab",
    "color.text": "#22262b",
    "color.muted": "#6b7280",
    "color.primary": "#2c3138",
    "color.on-primary": "#ffffff",
    "color.danger": "#b42318",
    "color.success": "#1a7f4b",
    "font.body": "sans",
    "font.heading": "sans",
    "radius": 6,
    "space": 4,
    "stroke": 1.5,
}

BUILTIN_THEMES: dict[str, dict[str, Any]] = {
    "paper": _PAPER,
    "ink": {
        **_PAPER,
        "color.bg": "#16181c",
        "color.surface": "#1f2228",
        "color.border": "#5a6270",
        "color.text": "#e6e8eb",
        "color.muted": "#9aa2ae",
        "color.primary": "#e6e8eb",
        "color.on-primary": "#16181c",
        "color.danger": "#f2705f",
        "color.success": "#4cc38a",
    },
    "blueprint": {
        **_PAPER,
        "color.bg": "#f2f6fc",
        "color.surface": "#ffffff",
        "color.border": "#3f6fc0",
        "color.text": "#1d4a96",
        "color.muted": "#4f74b8",
        "color.primary": "#1d4a96",
        "color.on-primary": "#ffffff",
        "color.danger": "#1d4a96",
        "color.success": "#1d4a96",
        "radius": 2,
    },
}

TOKEN_NAMES: tuple[str, ...] = tuple(_PAPER)
"""Token names in the order of section 9.2."""

_COLOR = re.compile(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})")
_NUM = re.compile(r"-?[0-9]+(\.[0-9]+)?")
MAX_EXTENDS = 4


@dataclass
class Theme:
    """A resolved theme."""

    name: str
    colors: dict[str, str]
    font_body: str
    font_heading: str
    radius: float
    space: float
    stroke: float


def check_token(token: str, value: Any) -> tuple[Any, str | None]:
    """Checks and normalises one token value. Returns (value, None), or (None, problem)."""
    if token.startswith("color."):
        if not isinstance(value, str) or _COLOR.fullmatch(value) is None:
            return None, f"{token} must be a colour written #rgb or #rrggbb"
        hex_ = value[1:].lower()
        if len(hex_) == 3:
            hex_ = "".join(c + c for c in hex_)
        return f"#{hex_}", None
    if token in ("font.body", "font.heading"):
        if value in ("sans", "serif", "mono") and isinstance(value, str):
            return value, None
        return None, f"{token} must be sans, serif or mono"
    if _js.is_number(value):
        n = float(value)
    elif _NUM.fullmatch(_js.to_string(value)):
        n = float(_js.to_string(value))
    else:
        n = math.nan
    if token == "radius":
        if _js.is_integer(n) and 0 <= n <= 16:
            return n, None
        return None, "radius must be a whole number from 0 to 16"
    if token == "space":
        if _js.is_integer(n) and 2 <= n <= 8:
            return n, None
        return None, "space must be a whole number from 2 to 8"
    if token == "stroke":
        if math.isfinite(n) and 1 <= n <= 3 and _js.is_integer(n * 2):
            return n, None
        return None, "stroke must be from 1 to 3, in steps of 0.5"
    return None, f'there is no token "{token}"'


def luminance(hex_: str) -> float:
    """WCAG 2 relative luminance of a #rrggbb colour."""

    def ch(i: int) -> float:
        c = int(hex_[1 + i * 2 : 3 + i * 2], 16) / 255
        if c <= 0.04045:
            return c / 12.92
        return float(((c + 0.055) / 1.055) ** 2.4)

    return 0.2126 * ch(0) + 0.7152 * ch(1) + 0.0722 * ch(2)


def contrast(a: str, b: str) -> float:
    """WCAG 2 contrast ratio between two #rrggbb colours."""
    hi, lo = sorted([luminance(a), luminance(b)], reverse=True)
    return (hi + 0.05) / (lo + 0.05)


@dataclass
class _Source:
    tokens: list[tuple[str, Any]]
    extends: Any
    """The name this theme extends, or None."""
    line_of: Callable[[str], tuple[int, int]]
    """Where to report problems with this theme's tokens."""


def _entries(tokens: Any) -> list[tuple[str, Any]]:
    """Object.entries for a token map, which may come from the host as any JSON value."""
    if isinstance(tokens, dict):
        return list(tokens.items())
    if isinstance(tokens, list):
        return [(str(i), v) for i, v in enumerate(tokens)]
    if isinstance(tokens, str):
        return [(str(i), c) for i, c in enumerate(tokens)]
    return []


def _key(name: Any) -> Any:
    """A key that tells a name apart from a number with the same text, as a JavaScript Set does."""
    if isinstance(name, str):
        return ("s", name)
    if _js.is_number(name):
        return ("n", float(name))
    return ("o", _js.to_string(name))


def resolve_theme(
    doc: dict[str, Any],
    themes: dict[str, Any] | None,
    default_theme: Any,
    token_lines: dict[str, int],
    diagnostics: list[Diagnostic],
) -> Theme:
    """Resolves the theme a source uses, reporting W502 to W505 and E506 (section 9).

    Never raises: every problem falls back to an inherited value.
    """
    decl = doc.get("theme")
    theme_loc = decl.get("loc", {"line": 1, "column": 1}) if decl else {"line": 1, "column": 1}
    tl = (theme_loc["line"], theme_loc["column"])
    hosts: dict[str, Any] = themes if isinstance(themes, dict) else {}
    is_block = decl is not None and "tokens" in decl

    def is_own(name: Any) -> bool:
        return is_block and decl is not None and isinstance(name, str) and name == decl["name"]

    def lookup(name: Any) -> _Source | None:
        if is_own(name) and decl is not None:
            return _Source(
                _entries(decl.get("tokens", {})),
                decl.get("extends"),
                lambda t: (token_lines.get(t, tl[0]), 3),
            )
        key = _js.to_string(name)
        if key in hosts:
            h = hosts[key]
            h = h if isinstance(h, dict) else {}
            tokens = h.get("tokens")
            return _Source(_entries(tokens if tokens is not None else {}), h.get("extends"), lambda t: tl)
        if key in BUILTIN_THEMES:
            return _Source(list(BUILTIN_THEMES[key].items()), None, lambda t: tl)
        return None

    # Which theme to use.
    fallback = default_theme if default_theme is not None else "paper"
    name: Any = decl["name"] if decl is not None else fallback
    if lookup(name) is None:
        using = fallback if lookup(fallback) is not None else "paper"
        diagnostics.append(
            diagnostic(
                "W502",
                tl[0],
                tl[1],
                f'There is no theme "{_js.to_string(name)}"; using {_js.to_string(using)}',
            )
        )
        name = using

    # Follow the extends chain from the chosen theme down to a built-in.
    chain: list[_Source] = []
    seen: set[Any] = set()
    current: Any = name
    while current is not None:
        source = lookup(current)
        if source is None:
            break
        if _key(current) in seen:
            diagnostics.append(
                diagnostic("E506", tl[0], tl[1], f'Theme "{_js.to_string(current)}" extends itself')
            )
            break
        seen.add(_key(current))
        chain.append(source)
        if len(chain) > MAX_EXTENDS + 1:
            diagnostics.append(
                diagnostic(
                    "E506",
                    tl[0],
                    tl[1],
                    f'Theme "{_js.to_string(name)}" extends more than {MAX_EXTENDS} themes deep',
                )
            )
            break
        is_builtin = not is_own(current) and _js.to_string(current) not in hosts
        if is_builtin:
            break
        nxt = source.extends if source.extends is not None else "paper"
        if lookup(nxt) is None:
            diagnostics.append(
                diagnostic(
                    "W502", tl[0], tl[1], f'There is no theme "{_js.to_string(nxt)}" to extend; using paper'
                )
            )
            current = "paper"
        else:
            current = nxt

    # Apply tokens from the base up, validating each one.
    tokens: dict[str, Any] = dict(_PAPER)
    for source in reversed(chain):
        for token, value in source.tokens:
            line, column = source.line_of(token)
            if token not in TOKEN_NAMES:
                diagnostics.append(
                    diagnostic("W503", line, column, f'Line {line}: there is no token "{token}"')
                )
                continue
            checked, problem = check_token(token, value)
            if problem is not None:
                diagnostics.append(diagnostic("W504", line, column, f"Line {line}: {problem}"))
                continue
            tokens[token] = checked

    theme = Theme(
        name=_js.to_string(name),
        colors={k[len("color.") :]: str(v) for k, v in tokens.items() if k.startswith("color.")},
        font_body=str(tokens["font.body"]),
        font_heading=str(tokens["font.heading"]),
        radius=float(tokens["radius"]),
        space=float(tokens["space"]),
        stroke=float(tokens["stroke"]),
    )

    for a, b, what in (
        (theme.colors["text"], theme.colors["surface"], "Text on surface"),
        (theme.colors["on-primary"], theme.colors["primary"], "On-primary on primary"),
    ):
        ratio = contrast(a, b)
        if ratio < 3:
            shown = math.floor(ratio * 10) / 10
            diagnostics.append(diagnostic("W505", tl[0], tl[1], f"{what} has contrast {shown:.1f}:1"))
    return theme
