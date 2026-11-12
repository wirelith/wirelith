# SPDX-License-Identifier: MIT

"""Validation (spec sections 5 to 7, 15 and 16): everything that can be checked from the
syntax tree, after parsing. Diagnostics about meaning point at the start of the element's line.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from . import _data, _js
from .components import (
    ALIGNS,
    COMMON_ATTRS,
    COMMON_FLAGS,
    COMPONENTS,
    INPUT_TYPES,
    JUSTIFIES,
    OVERLAYS,
    SIZES,
    closest,
)
from .parse import Diagnostic, Node, diagnostic

CAPS = {
    "elements": 2000,
    "screens": 50,
    "depth": 16,
    "string": 500,
    "list_items": 100,
    "table_columns": 20,
    "table_rows": 200,
    "links": 500,
    "canvas": 16000,
}

PERCENT = re.compile(r"([0-9]+(\.[0-9]+)?)%")
SCREEN_SIZE = re.compile(r"([0-9]+)x([0-9]+)")
RATIO = re.compile(r"([0-9]+(\.[0-9]+)?):([0-9]+(\.[0-9]+)?)")


@dataclass
class Walked:
    """An element met in a walk, with its parent, screen, depth and index."""

    node: Node
    parent: Node | None
    screen: Node
    depth: int
    index: int


def walk(doc: dict[str, Any]) -> list[Walked]:
    """A depth-first, pre-order walk over the screens and everything under them (section 12.2)."""
    out: list[Walked] = []

    def visit(node: Node, parent: Node | None, screen: Node, depth: int) -> None:
        out.append(Walked(node, parent, screen, depth, len(out)))
        for c in node.get("children", []):
            visit(c, node, screen, depth + 1)

    for s in doc["screens"]:
        visit(s, None, s, 1)
    return out


def is_ref(v: Any) -> bool:
    """Whether a value is a reference to an id, such as #home."""
    return isinstance(v, dict)


def has(n: Node, flag: str) -> bool:
    """Whether an element has a flag."""
    return flag in n.get("flags", ())


def attr(n: Node, key: str) -> Any:
    """An attribute's value, or None."""
    return n.get("attrs", {}).get(key)


def text_of(v: Any) -> str | None:
    """Text of a value that may be written bare or quoted, such as value=1."""
    if isinstance(v, str):
        return v
    if _js.is_number(v):
        return _js.number_to_string(v)
    return None


def _strings_of(n: Node) -> list[str]:
    strings: list[str] = []
    if "label" in n:
        strings.append(n["label"])
    link = n.get("link")
    if link is not None and "label" in link:
        strings.append(link["label"])
    strings.extend(n.get("items", []))
    for v in n.get("attrs", {}).values():
        if isinstance(v, str):
            strings.append(v)
        elif isinstance(v, list):
            strings.extend(v)
    return strings


def check_caps(doc: dict[str, Any], all_: list[Walked]) -> Diagnostic | None:
    """Checks the size caps (section 16) that can be checked before layout."""
    limit = CAPS["string"]
    if len(all_) > CAPS["elements"]:
        return diagnostic(
            "E701", 1, 1, f"This source has {len(all_):,} elements; the limit is {CAPS['elements']:,}"
        )
    if len(doc["screens"]) > CAPS["screens"]:
        return diagnostic(
            "E701", 1, 1, f"This source has {len(doc['screens'])} screens; the limit is {CAPS['screens']}"
        )
    links = len(doc.get("flows", []))
    for w in all_:
        n = w.node
        line, col = n["loc"]["line"], n["loc"]["column"]
        if w.depth > CAPS["depth"]:
            return diagnostic(
                "E701", line, col, f"Line {line}: elements are nested more than {CAPS['depth']} deep"
            )
        if "link" in n:
            links += 1
        for s in _strings_of(n):
            if len(s) > limit:
                return diagnostic(
                    "E701",
                    line,
                    col,
                    f"Line {line}: a string is {len(s)} characters long; the limit is {limit}",
                )
        lists = [n.get("items")] + [v for v in n.get("attrs", {}).values() if isinstance(v, list)]
        for lst in lists:
            if lst is not None and len(lst) > CAPS["list_items"]:
                return diagnostic(
                    "E701",
                    line,
                    col,
                    f"Line {line}: a list has {len(lst)} items; the limit is {CAPS['list_items']}",
                )
        if n["type"] == "table":
            cols = len(n.get("items", []))
            rows_attr = attr(n, "rows")
            rows = len(n.get("children", [])) + (
                max(0.0, _js.trunc(float(rows_attr))) if _js.is_number(rows_attr) else 0
            )
            if cols > CAPS["table_columns"]:
                return diagnostic(
                    "E701",
                    line,
                    col,
                    f"Line {line}: this table has {cols} columns; the limit is {CAPS['table_columns']}",
                )
            if rows > CAPS["table_rows"]:
                return diagnostic(
                    "E701",
                    line,
                    col,
                    f"Line {line}: this table has {_js.number_to_string(rows)} rows; "
                    f"the limit is {CAPS['table_rows']}",
                )
    for f in doc.get("flows", []):
        s = f.get("label", "")
        if len(s) > limit:
            line = f["loc"]["line"]
            return diagnostic(
                "E701",
                line,
                f["loc"]["column"],
                f"Line {line}: a string is {len(s)} characters long; the limit is {limit}",
            )
    theme = doc.get("theme")
    if theme is not None:
        values = [theme["name"], theme.get("extends", "")] + [
            _js.to_string(v) for v in theme.get("tokens", {}).values()
        ]
        for s in values:
            if len(s) > limit:
                loc = theme.get("loc", {"line": 1, "column": 1})
                return diagnostic(
                    "E701",
                    loc["line"],
                    loc["column"],
                    f"Line {loc['line']}: a string is {len(s)} characters long; the limit is {limit}",
                )
    if links > CAPS["links"]:
        return diagnostic(
            "E701", 1, 1, f"This source has {links} links and flows; the limit is {CAPS['links']}"
        )
    return None


def size_value(v: Any) -> bool:
    """Whether a width or height value is allowed (section 5.10)."""
    if _js.is_number(v):
        return bool(0 <= v <= 16000)
    if not isinstance(v, str):
        return False
    if v == "fill":
        return True
    m = PERCENT.fullmatch(v)
    return m is not None and float(m.group(1)) <= 100


def _whole_in(v: Any, lo: int, hi: int) -> bool:
    return _js.is_number(v) and _js.is_integer(v) and lo <= v <= hi


def _show(v: Any) -> str:
    if isinstance(v, list):
        return "[" + ", ".join(v) + "]"
    if is_ref(v):
        return f"#{v['ref']}"
    return _js.to_string(v)


def _value_problem(node: Node, key: str, v: Any) -> str | None:
    """Checks one value against section 5.10's table. Returns the problem, or None."""
    t = node["type"]
    if key in ("gap", "pad"):
        return (
            None
            if isinstance(v, str) and v in SIZES
            else f'{key}="{_show(v)}" is not a size; using the default'
        )
    if key == "align":
        return (
            None
            if isinstance(v, str) and v in ALIGNS
            else f'align="{_show(v)}" is not start, center, end or stretch'
        )
    if key == "justify":
        return (
            None
            if isinstance(v, str) and v in JUSTIFIES
            else f'justify="{_show(v)}" is not start, center, end or between'
        )
    if key in ("width", "height"):
        return (
            None if size_value(v) else f'{key}="{_show(v)}" is not a number of pixels, a percentage or fill'
        )
    if key == "type":
        return (
            None
            if t == "input" and isinstance(v, str) and v in INPUT_TYPES
            else f'type="{_show(v)}" is not a field type; using text'
        )
    if key == "cols":
        return None if _whole_in(v, 1, 12) else "cols must be a whole number from 1 to 12; using 2"
    if key == "span":
        return None if _whole_in(v, 1, 12) else "span must be a whole number from 1 to 12; using 1"
    if key in ("rows", "lines"):
        return None if _whole_in(v, 1, 100) else f"{key} must be a whole number from 1 to 100"
    if key == "size":
        if t == "screen":
            m = SCREEN_SIZE.fullmatch(v) if isinstance(v, str) else None
            ok = m is not None and 1 <= int(m.group(1)) <= 16000 and 1 <= int(m.group(2)) <= 16000
            return (
                None
                if ok
                else f'size="{_show(v)}" is not WxH with each side from 1 to 16000; using the device size'
            )
        if _js.is_number(v):
            return None if 0 <= v <= 16000 else "size must be from 0 to 16000"
        return None if isinstance(v, str) and v in SIZES else f'size="{_show(v)}" is not a size'
    if key == "ratio":
        m = RATIO.fullmatch(v) if isinstance(v, str) else None
        ok = m is not None and float(m.group(1)) > 0 and float(m.group(3)) > 0
        return None if ok else f'ratio="{_show(v)}" is not W:H; using 4:3'
    if key in ("of", "for"):
        return None if is_ref(v) else f"{key}= takes an id, such as {key}=#home"
    if key in ("state", "placeholder", "value", "error", "active", "badge", "icon"):
        return None if isinstance(v, str) or _js.is_number(v) else f"{key} takes text"
    return None


def check(doc: dict[str, Any]) -> list[Diagnostic]:
    """All semantic checks. Returns diagnostics; never raises."""
    out: list[Diagnostic] = []
    all_ = walk(doc)
    caps = check_caps(doc, all_)
    if caps is not None:
        return [caps]

    def add(code: str, n: dict[str, Any], message: str) -> None:
        out.append(diagnostic(code, n["loc"]["line"], n["loc"]["column"], message))

    by_id: dict[str, Walked] = {}
    skipped: set[int] = set()

    # Ids (E301).
    for w in all_:
        id_ = w.node.get("id")
        if id_ is None:
            continue
        prev = by_id.get(id_)
        if prev is not None:
            line = w.node["loc"]["line"]
            add("E301", w.node, f"Line {line}: #{id_} is already used on line {prev.node['loc']['line']}")
        else:
            by_id[id_] = w

    # Placement and children (E203, E204), per screen.
    for screen in doc["screens"]:
        seen: dict[str, Node] = {}
        for c in screen.get("children", []):
            key = (
                ("sidebar right" if has(c, "right") else "sidebar left")
                if c["type"] == "sidebar"
                else c["type"]
            )
            if key in ("header", "footer", "sidebar left", "sidebar right"):
                prev_node = seen.get(key)
                if prev_node is not None:
                    add(
                        "E203",
                        c,
                        f"Line {c['loc']['line']}: a screen has only one {key}; "
                        f"the first is on line {prev_node['loc']['line']}",
                    )
                else:
                    seen[key] = c
    for w in all_:
        n = w.node
        p = w.parent
        if p is not None and id(p) in skipped:
            skipped.add(id(n))
            continue
        if p is not None:
            ps = COMPONENTS.get(p["type"])
            if ps is not None and not ps.children:
                if p["children"][0] is n:
                    add("E204", n, f'Line {n["loc"]["line"]}: "{p["type"]}" cannot contain other elements')
                skipped.add(id(n))
                continue
            where = _placement_problem(n, p)
            if where:
                add("E203", n, f"Line {n['loc']['line']}: {where}")

    # Flags, attributes, label, items and values (W202, W205), icons (W301), lists (W302).
    icons = _data.icon_name_set()
    for w in all_:
        n = w.node
        if id(n) in skipped:
            continue
        spec = COMPONENTS.get(n["type"])
        if spec is None:
            continue
        line = n["loc"]["line"]
        # One diagnostic per code per element, listing every problem, because they share a position.
        name = "row" if n["type"] == "table-row" else n["type"]
        own = [*spec.flags, *spec.attrs]
        unknown_parts: list[str] = []
        bad_values: list[str] = []
        for f in n.get("flags", []):
            if f not in spec.flags and f not in COMMON_FLAGS:
                unknown_parts.append(
                    f'"{f}" without a value' if f in spec.attrs or f in COMMON_ATTRS else f'"{f}"'
                )
        for k, v in n.get("attrs", {}).items():
            if k in spec.flags or k in COMMON_FLAGS:
                unknown_parts.append(f'"{k}=" ({k} is a flag; write it on its own)')
                continue
            if k not in spec.attrs and k not in COMMON_ATTRS:
                unknown_parts.append(f'"{k}"')
                continue
            problem = _value_problem(n, k, v)
            if problem:
                bad_values.append(problem)
        if "label" in n and not spec.label:
            unknown_parts.append("a label")
        if "items" in n and not spec.items:
            unknown_parts.append("a list")
        if unknown_parts:
            has_text = ", ".join(own) or "no flags or attributes of its own"
            add("W202", n, f'Line {line}: "{name}" has no {", ".join(unknown_parts)} (it has: {has_text})')
        if bad_values:
            add("W205", n, f"Line {line}: {'; '.join(bad_values)}")

        # Icons.
        icon_name: str | None = None
        if n["type"] == "icon":
            icon_name = n.get("label")
        elif n["type"] in ("button", "item"):
            icon_name = text_of(attr(n, "icon"))
        if icon_name is not None and icon_name not in icons:
            guess = closest(icon_name, _data.icon_names())
            add(
                "W301",
                n,
                f'Line {line}: there is no icon "{icon_name}".'
                + (f' Did you mean "{guess}"?' if guess else ""),
            )

        # active= and value= must name an entry.
        entries: list[str] | None = n.get("items")
        # A nav with no children at all has no entries to check, even an empty list of them.
        if entries is None and n["type"] == "nav" and "children" in n:
            entries = [c.get("label", "") for c in n.get("children", []) if c["type"] == "item"]
        named: str | None = None
        if n["type"] in ("nav", "tabs"):
            named = text_of(attr(n, "active"))
        elif n["type"] in ("select", "radio"):
            named = text_of(attr(n, "value"))
        if named is not None and entries is not None and named not in entries:
            what = "tabs" if n["type"] == "tabs" else "entries" if n["type"] == "nav" else "options"
            add("W302", n, f'Line {line}: "{named}" is not one of the {what}')

        # Table rows with more cells than columns.
        if n["type"] == "table-row" and w.parent is not None and w.parent["type"] == "table":
            cols = len(w.parent.get("items", []))
            cells = len(n.get("items", []))
            if cells > cols:
                add("W601", n, f"Line {line}: this row has {cells} cells but the table has {cols} columns")

    # References (E401, E402).
    screen_of = {id(w.node): w.screen for w in all_}
    ids = list(by_id.keys())

    def unknown(n: dict[str, Any], id_: str) -> None:
        guess = closest(id_, ids)
        add(
            "E401",
            n,
            f"Line {n['loc']['line']}: there is no #{id_}." + (f" Did you mean #{guess}?" if guess else ""),
        )

    targeted: set[str] = set()
    any_link = False
    for w in all_:
        n = w.node
        if id(n) in skipped:
            continue
        line = n["loc"]["line"]
        link = n.get("link")
        if link is not None:
            any_link = True
            to = link["to"]
            t = by_id.get(to)
            if t is None:
                unknown(n, to)
            elif t.node["type"] != "screen" and t.node["type"] not in OVERLAYS:
                add(
                    "E401",
                    n,
                    f"Line {line}: #{to} is a {t.node['type']}; "
                    "a link must point at a screen, modal or drawer",
                )
            elif t.node["type"] in OVERLAYS and t.screen is not w.screen:
                add("E402", n, f"Line {line}: #{to} is in a different screen")
            elif t.node["type"] == "screen":
                targeted.add(to)
        if n["type"] == "note":
            f = attr(n, "for")
            if is_ref(f):
                t = by_id.get(f["ref"])
                if t is None:
                    unknown(n, f["ref"])
                elif screen_of.get(id(t.node)) is not w.screen:
                    add("E402", n, f"Line {line}: #{f['ref']} is in a different screen")
        if n["type"] == "screen":
            of = attr(n, "of")
            if is_ref(of):
                t = by_id.get(of["ref"])
                if t is None:
                    unknown(n, of["ref"])
                elif t.node["type"] != "screen":
                    add("E401", n, f"Line {line}: #{of['ref']} is a {t.node['type']}; of= must name a screen")
                elif is_ref(attr(t.node, "of")):
                    add(
                        "E401",
                        n,
                        f"Line {line}: #{of['ref']} is itself a variant; of= must name a screen that isn't",
                    )
    for fl in doc.get("flows", []):
        any_link = True
        for id_ in (fl["from"], fl["to"]):
            t = by_id.get(id_)
            if t is None:
                unknown(fl, id_)
            elif t.node["type"] != "screen":
                add(
                    "E401",
                    fl,
                    f"Line {fl['loc']['line']}: #{id_} is a {t.node['type']}; a flow links two screens",
                )
        targeted.add(fl["to"])

    # Unreachable screens (W403).
    if any_link:
        for i, s in enumerate(doc["screens"]):
            if i == 0 or is_ref(attr(s, "of")):
                continue
            sid = s.get("id")
            if sid is None or sid not in targeted:
                what = f"#{sid}" if sid else f'"{s.get("label", "")}"'
                add("W403", s, f"Screen {what} is never reached")
    return out


def _placement_problem(n: Node, p: Node) -> str | None:
    t = n["type"]
    if t == "item":
        return None if p["type"] in ("list", "nav") else '"item" must be directly inside a list or a nav'
    if t in ("note", "modal", "drawer", "header", "footer"):
        return None if p["type"] == "screen" else f'"{t}" must be directly inside a screen'
    if t == "sidebar":
        return (
            None if p["type"] in ("screen", "row") else '"sidebar" must be directly inside a screen or a row'
        )
    if p["type"] == "table" and t != "table-row":
        return "a table contains only rows"
    return None


def has_errors(ds: list[Diagnostic]) -> bool:
    """True when a diagnostic list has an error."""
    return any(d["severity"] == "error" for d in ds)


def sort_diagnostics(ds: list[Diagnostic]) -> list[Diagnostic]:
    """Sorts diagnostics by line, column and code, and drops repeats (section 15)."""
    out: list[Diagnostic] = []
    for d in sorted(ds, key=lambda d: (d["line"], d["column"], d["code"])):
        if out:
            last = out[-1]
            if last["line"] == d["line"] and last["column"] == d["column"] and last["code"] == d["code"]:
                continue
        out.append(d)
    return out
