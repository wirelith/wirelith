# SPDX-License-Identifier: MIT

"""The public functions. Both are pure: no I/O besides reading the package's own data."""

from __future__ import annotations

from typing import Any

from .components import OVERLAYS
from .layout import Layout
from .parse import Diagnostic, Node, parse_source
from .theme import Theme, resolve_theme
from .validate import check, has, has_errors, sort_diagnostics, walk


def parse(source: str) -> dict[str, Any]:
    """Parses a source into its syntax tree (spec section 13), with the syntax diagnostics.

    Returns a dict with the keys "tree" and "diagnostics".
    """
    p = parse_source(source)
    return {"tree": p.tree, "diagnostics": sort_diagnostics(p.diagnostics)}


def validate(
    source: str,
    themes: dict[str, Any] | None = None,
    default_theme: str | None = None,
    *,
    screen: str | None = None,
) -> list[dict[str, Any]]:
    """Every diagnostic for a source (spec section 15), sorted.

    `themes` and `default_theme` are the host's themes and default theme (spec section 9.4).
    `screen` is the render option of that name: when given, only that screen or overlay is
    laid out, so only its layout warnings are reported. It raises ValueError when `screen`
    names nothing that can be shown, as the reference implementation does.
    """
    p = parse_source(source)
    if p.too_large or any(d["code"] == "E103" for d in p.diagnostics):
        return sort_diagnostics(p.diagnostics)
    semantic = check(p.tree)
    if len(semantic) == 1 and semantic[0]["code"] == "E701":
        return semantic
    theme_diagnostics: list[Diagnostic] = []
    theme = resolve_theme(p.tree, themes, default_theme, p.token_lines, theme_diagnostics)
    diagnostics = sort_diagnostics([*p.diagnostics, *semantic, *theme_diagnostics])
    if has_errors(diagnostics):
        return diagnostics
    if not p.tree["screens"]:
        # The theme specimen is drawn instead; its layout warnings are not the source's.
        if screen is not None:
            raise ValueError(_no_screen(screen))
        return diagnostics
    warnings = layout_warnings(p.tree, theme, screen)
    return sort_diagnostics([*diagnostics, *warnings])


def _no_screen(screen: str) -> str:
    return f'The screen option names "{screen}", which is not a screen, modal or drawer in this source'


def layout_warnings(doc: dict[str, Any], theme: Theme, screen: str | None = None) -> list[Diagnostic]:
    """The warnings from laying out every frame the overview draws (W601, W602).

    Each screen has a base frame with its open overlays, and each overlay that is the target
    of a link and is not open has an extra frame of its own (spec section 7.4). With `screen`,
    only the one frame for that screen or overlay is laid out.
    """
    layout = Layout(doc, theme)
    all_ = walk(doc)

    def overlays_of(s: Node) -> list[Node]:
        return [c for c in s.get("children", []) if c["type"] in OVERLAYS]

    if screen is not None:
        target = next((w for w in all_ if w.node.get("id") == screen), None)
        if target is None or (target.node["type"] != "screen" and target.node["type"] not in OVERLAYS):
            raise ValueError(_no_screen(screen))
        s = target.screen
        open_ = [o for o in overlays_of(s) if has(o, "open")]
        if target.node["type"] == "screen":
            layout.frame(s, "", open_)
        else:
            o = target.node
            shown = open_ if any(x is o for x in open_) else [*open_, o]
            layout.frame(s, "", shown, o)
        return layout.warnings

    linked = {w.node["link"]["to"] for w in all_ if "link" in w.node}
    for s in doc["screens"]:
        open_ = [o for o in overlays_of(s) if has(o, "open")]
        layout.frame(s, "", open_)
        for o in overlays_of(s):
            if has(o, "open") or "id" not in o or o["id"] not in linked:
                continue
            layout.frame(s, "", [*open_, o], o)
    return layout.warnings
