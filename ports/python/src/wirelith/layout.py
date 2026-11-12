# SPDX-License-Identifier: MIT

"""Layout (spec section 10 and Appendix C): a box for every element.

This port lays out frames only as far as validation needs: the warnings W601 and W602 come
from here. The arithmetic follows the reference implementation step by step, in IEEE doubles
and in the same order, so that every width, and so every warning, comes out the same.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from . import _js
from ._js import max_, min_
from .components import DEVICES, OVERLAYS
from .measure import Font, line_width, longest_word, measure, r, wrap
from .parse import Diagnostic, Node, diagnostic
from .theme import Theme
from .validate import attr, has, is_ref, text_of

_MAIN_H = frozenset(["row", "header", "footer"])
# Leaves drawn at their own width at the start of a wider box (Appendix C.1).
_OWN_WIDTH = frozenset(["badge", "avatar", "icon", "checkbox", "toggle", "radio"])
_CONTAINERS = frozenset(
    [
        "row",
        "column",
        "grid",
        "header",
        "footer",
        "sidebar",
        "card",
        "tabs",
        "list",
        "empty",
        "error",
        "nav",
        "table",
    ]
)
_PERCENT = re.compile(r"([0-9]+(\.[0-9]+)?)%")
_RATIO = re.compile(r"([0-9]+(\.[0-9]+)?):([0-9]+(\.[0-9]+)?)")
_SCREEN_SIZE = re.compile(r"([0-9]+)x([0-9]+)")


@dataclass
class Box:
    """A position and size."""

    x: float
    y: float
    w: float
    h: float


@dataclass
class Laid:
    """An element with its box, relative to its frame."""

    node: Node
    box: Box
    children: list[Laid] = field(default_factory=list)
    entries: list[Box] = field(default_factory=list)
    """The boxes of entries for nav, tabs and list."""
    table_top: float | None = None


@dataclass
class Frame:
    """A screen's frame, laid out."""

    key: str
    screen: Node
    w: float
    h: float
    device_h: float
    open: list[Laid]
    sidebars: list[Laid]
    body: list[Laid]
    header: Laid | None = None
    footer: Laid | None = None
    overlay: Laid | None = None


def _num(v: Any) -> float | None:
    return float(v) if _js.is_number(v) else None


def _sum(xs: list[float]) -> float:
    """Adds left to right, as a JavaScript loop does (sum() may compensate rounding)."""
    total = 0.0
    for x in xs:
        total += x
    return total


def share(room: float, n: int) -> list[float]:
    """Shares room equally: each share rounded, the last takes what is left (section 10.1)."""
    out: list[float] = []
    left = room
    for i in range(n):
        s = r(left) if i == n - 1 else r(room / n)
        out.append(s)
        left -= s
    return out


def _justify_offsets(j: str, free: float, n: int) -> list[float]:
    out: list[float] = []
    for i in range(n):
        if j == "center":
            out.append(r(free / 2))
        elif j == "end":
            out.append(free)
        elif j == "between" and n > 1:
            out.append(r((free * i) / (n - 1)))
        else:
            out.append(0.0)
    return out


def shift_children(lay: Laid, dx: float, dy: float) -> None:
    """Moves everything under a laid-out element."""
    for c in lay.children:
        c.box.x = r(c.box.x + dx)
        c.box.y = r(c.box.y + dy)
        shift_children(c, dx, dy)
    for e in lay.entries:
        e.x = r(e.x + dx)
        e.y = r(e.y + dy)
    if lay.table_top is not None:
        lay.table_top = r(lay.table_top + dy)


class Layout:
    """Lays out the screens of one document with one theme, collecting warnings."""

    def __init__(self, doc: dict[str, Any], theme: Theme) -> None:
        self.doc = doc
        self.theme = theme
        self.u = theme.space
        self.warnings: list[Diagnostic] = []
        # Set while laying out a screen's header and footer, whose side padding is the screen's.
        self.bar_pad: float | None = None

    # ---- fonts ------------------------------------------------------------------------------

    def body(self, size: float, weight: int) -> Font:
        return Font(self.theme.font_body, weight, size)

    def heading(self, size: float, weight: int) -> Font:
        return Font(self.theme.font_heading, weight, size)

    def text_style(self, type_: str) -> tuple[Font, float]:
        """Font and line height of a text component (Appendix C.4)."""
        if type_ == "h1":
            return self.heading(32, 700), 40
        if type_ == "h2":
            return self.heading(24, 700), 32
        if type_ == "h3":
            return self.heading(18, 600), 24
        if type_ == "label":
            return self.body(13, 500), 18
        return self.body(15, 400), 22

    # ---- spacing ----------------------------------------------------------------------------

    def scale(self, word: Any, fallback: float) -> float:
        """A size word in pixels (section 10.1)."""
        u = self.u
        if not isinstance(word, str):
            return fallback
        return {"none": 0.0, "xs": u, "sm": 2 * u, "md": 4 * u, "lg": 6 * u, "xl": 8 * u}.get(word, fallback)

    def gap(self, n: Node) -> float:
        return self.scale(attr(n, "gap"), 4 * self.u)

    def pad(self, n: Node) -> float:
        u = self.u
        fallback = 4 * u if n["type"] in ("card", "sidebar") else 0.0
        return self.scale(attr(n, "pad"), fallback)

    def align(self, n: Node) -> str:
        a = attr(n, "align")
        if isinstance(a, str) and a in ("start", "center", "end", "stretch"):
            return a
        return "center" if n["type"] in _MAIN_H else "stretch"

    def justify(self, n: Node) -> str:
        j = attr(n, "justify")
        return j if isinstance(j, str) and j in ("center", "end", "between") else "start"

    # ---- intrinsic widths (section 10.4) ----------------------------------------------------

    def intrinsic(self, n: Node) -> tuple[float, float]:
        """Preferred and minimum widths."""
        u = self.u
        fixed = _num(attr(n, "width"))
        if fixed is not None:
            return fixed, fixed
        t = n["type"]
        label = n.get("label", "")
        if t in ("h1", "h2", "h3", "text", "label", "link"):
            f, _ = self.text_style(t)
            if t == "text" and "label" not in n:
                return 240.0, 96.0
            return line_width(label, f), longest_word(label, f)
        if t == "badge":
            w = measure(label, self.body(13, 500)) + 4 * u
            return w, w
        if t == "button":
            icon = attr(n, "icon") is not None
            h = self.button_height(n)
            if icon and "label" not in n:
                return h, h
            w = measure(label, self.body(15, 600)) + 8 * u + (6 * u if icon else 0)
            return w, w
        if t in ("input", "textarea", "select"):
            return 240.0, 96.0
        if t in ("checkbox", "toggle"):
            mark = 36 if t == "toggle" else 16
            w = mark + 2 * u + measure(label, self.body(15, 400))
            return w, w
        if t == "radio":
            w = measure(label, self.body(13, 500)) if "label" in n else 0.0
            for it in n.get("items", []):
                w = max_(w, 16 + 2 * u + measure(it, self.body(15, 400)))
            return w, w
        if t == "icon":
            s = self.icon_size(n)
            return s, s
        if t == "avatar":
            s = self.avatar_size(n)
            return s, s
        if t == "image":
            return 160.0, 160.0
        if t == "spacer":
            s = attr(n, "size")
            w = float(s) if _js.is_number(s) else self.scale(s, 0) if s is not None else 0.0
            return w, w
        if t == "divider":
            return self.theme.stroke, self.theme.stroke
        if t == "item":
            w = 6 * u + measure(label, self.body(15, 400))
            if attr(n, "icon") is not None:
                w += 16 + 2 * u
            b = text_of(attr(n, "badge"))
            if b is not None:
                w += 2 * u + measure(b, self.body(13, 500)) + 4 * u
            return w, w
        if t == "breadcrumbs":
            items = n.get("items", [])
            w = 0.0
            for i, it in enumerate(items):
                w += measure(it, self.body(15, 500 if i == len(items) - 1 else 400))
                if i > 0:
                    w += 16 + 2 * u
            return w, w
        if t == "nav":
            entries = self.nav_entries(n)
            vertical = has(n, "vertical")
            total = 0.0
            widest = 0.0
            for text, _active, entry_icon in entries:
                ew = measure(text, self.body(15, 600)) + (16 + 2 * u if entry_icon else 0)
                total += ew
                widest = max_(widest, ew)
            w = widest + 6 * u if vertical else total + max_(0, len(entries) - 1) * 6 * u
            return w, (w if vertical else widest)
        if t == "tabs":
            w = 0.0
            for tab in n.get("items", []):
                w += measure(tab, self.body(15, 600)) + 8 * u
            c_pref, c_min = self.column_intrinsic(n.get("children", []), 0)
            return max_(w, c_pref), max_(min_(w, 96), c_min)
        if t == "list":
            if "items" in n:
                w = 0.0
                for it in n["items"]:
                    w = max_(w, 5 * u + measure(it, self.body(15, 400)))
                return w, min_(w, 96)
            return self.column_intrinsic(n.get("children", []), 0)
        if t == "table":
            cols = max_(1, len(n["items"]) if "items" in n else 1)
            return 120 * cols, 64 * cols
        if t == "card":
            p = self.pad(n)
            c_pref, c_min = self.column_intrinsic(n.get("children", []), 0)
            tw = measure(n["label"], self.heading(15, 600)) if "label" in n else 0.0
            return max_(c_pref, tw) + 2 * p, max_(c_min, min_(tw, 96)) + 2 * p
        if t in ("empty", "error", "loading"):
            f = self.body(15, 400)
            msg = line_width(n["label"], f) if "label" in n else 0.0
            c_pref, c_min = self.column_intrinsic(n.get("children", []), 0)
            w = max_(32, msg, c_pref)
            return w, max_(32, c_min, longest_word(n["label"], f) if n.get("label") else 0)
        if t == "sidebar":
            sw = _num(attr(n, "width"))
            w = sw if sw is not None else 240.0
            return w, w
        if t == "swatches":
            w = 3 * 200 + 2 * 4 * u
            return w, w
        if t in ("row", "header", "footer"):
            kids = self.flow_children(n)
            p = self.pad(n)
            g = self.gap(n)
            pref = 0.0
            mn = 0.0
            for c in kids:
                c_pref, c_min = self.intrinsic(c)
                pref += c_pref
                mn += c_min
            gaps = max_(0, len(kids) - 1) * g
            if has(n, "wrap"):
                min_w = max_(0, *[self.intrinsic(c)[1] for c in kids])
            else:
                min_w = mn + gaps
            return pref + gaps + 2 * p, min_w + 2 * p
        if t == "grid":
            cols = self.cols(n)
            g = self.gap(n)
            widest = 0.0
            widest_min = 0.0
            for c in n.get("children", []):
                c_pref, c_min = self.intrinsic(c)
                widest = max_(widest, c_pref / min_(cols, self.span(c, cols)))
                widest_min = max_(widest_min, c_min / min_(cols, self.span(c, cols)))
            p = self.pad(n)
            return (
                r(widest * cols + g * (cols - 1) + 2 * p),
                r(widest_min * cols + g * (cols - 1) + 2 * p),
            )
        return self.column_intrinsic(n.get("children", []), self.pad(n))

    def column_intrinsic(self, kids: list[Node], pad: float) -> tuple[float, float]:
        pref = 0.0
        mn = 0.0
        for c in kids:
            if c["type"] == "note" or c["type"] in OVERLAYS:
                continue
            c_pref, c_min = self.intrinsic(c)
            pref = max_(pref, c_pref)
            mn = max_(mn, c_min)
        return pref + 2 * pad, mn + 2 * pad

    # ---- sizes of parts ----------------------------------------------------------------------

    def button_height(self, n: Node) -> float:
        return (7 if has(n, "sm") else 11 if has(n, "lg") else 9) * self.u

    def icon_size(self, n: Node) -> float:
        return 16.0 if has(n, "sm") else 24.0 if has(n, "lg") else 20.0

    def avatar_size(self, n: Node) -> float:
        return 24.0 if has(n, "sm") else 48.0 if has(n, "lg") else 32.0

    def cols(self, n: Node) -> int:
        c = attr(n, "cols")
        return int(c) if _js.is_number(c) and _js.is_integer(c) and 1 <= c <= 12 else 2

    def span(self, n: Node, cols: int) -> int:
        s = attr(n, "span")
        v = int(s) if _js.is_number(s) and _js.is_integer(s) and 1 <= s <= 12 else 1
        return min(v, cols)

    def flow_children(self, n: Node) -> list[Node]:
        """The children laid out in a container's flow (notes and overlays are not)."""
        return [c for c in n.get("children", []) if c["type"] != "note" and c["type"] not in OVERLAYS]

    def nav_entries(self, n: Node) -> list[tuple[str, bool, str | None]]:
        """The entries of a nav: text, whether active, and icon."""
        active = text_of(attr(n, "active"))
        if "items" in n:
            return [(t, t == active, None) for t in n["items"]]
        out: list[tuple[str, bool, str | None]] = []
        for c in n.get("children", []):
            if c["type"] != "item":
                continue
            is_active = has(c, "active") or ("label" in c and c["label"] == active)
            out.append((c.get("label", ""), is_active, text_of(attr(c, "icon"))))
        return out

    def nav_nodes(self, n: Node) -> list[Node | None]:
        """The node behind each nav entry, or None for an entry from the list."""
        if "items" in n:
            return [None for _ in n["items"]]
        return [c for c in n.get("children", []) if c["type"] == "item"]

    def width_in(self, c: Node, w: float) -> float | None:
        """A child's width in a container whose content width is `w` (section 10.3)."""
        v = attr(c, "width")
        if _js.is_number(v):
            return float(v)
        if isinstance(v, str):
            if v == "fill":
                return w
            m = _PERCENT.fullmatch(v)
            if m:
                return r((w * float(m.group(1))) / 100)
        return None

    # ---- layout ------------------------------------------------------------------------------

    def laid(self, n: Node, x: float, y: float, w: float, h: float) -> Laid:
        return Laid(n, Box(r(x), r(y), r(w), r(h)))

    def warn(self, code: str, n: Node, message: str) -> None:
        line = n["loc"]["line"]
        self.warnings.append(diagnostic(code, line, n["loc"]["column"], f"Line {line}: {message}"))

    def place(self, n: Node, x: float, y: float, w: float) -> Laid:
        """Lays out an element at (x, y) with width w. Returns it with its height."""
        u = self.u
        t = n["type"]
        label = n.get("label", "")
        fixed_h = self.fixed_height(n)
        if t in ("h1", "h2", "h3", "text", "link"):
            f, lh = self.text_style(t)
            if t == "text" and "label" not in n:
                lines = _num(attr(n, "lines"))
                count = lines if lines is not None and _js.is_integer(lines) and 1 <= lines <= 100 else 3
                out = self.laid(n, x, y, w, count * lh)
            else:
                wrapped, clipped = wrap(label, f, w)
                if clipped:
                    self.warn("W602", n, "a word is wider than its line and was clipped")
                out = self.laid(n, x, y, w, len(wrapped) * lh)
        elif t == "label":
            out = self.laid(n, x, y, w, 18)
        elif t == "button":
            out = self.laid(n, x, y, w, self.button_height(n))
        elif t in ("input", "select", "textarea"):
            h = 18 + u if "label" in n else 0.0
            if t == "textarea":
                rows = _num(attr(n, "rows"))
                h += (
                    rows if rows is not None and _js.is_integer(rows) and 1 <= rows <= 100 else 3
                ) * 22 + 4 * u
            else:
                h += 10 * u
            if t == "input" and text_of(attr(n, "error")) is not None:
                h += u + 18
            out = self.laid(n, x, y, w, h)
        elif t in ("checkbox", "toggle"):
            out = self.laid(n, x, y, w, 6 * u)
        elif t == "radio":
            out = self.laid(n, x, y, w, (18 + u if "label" in n else 0) + len(n.get("items", [])) * 6 * u)
        elif t == "icon":
            out = self.laid(n, x, y, w, self.icon_size(n))
        elif t == "avatar":
            out = self.laid(n, x, y, w, self.avatar_size(n))
        elif t == "badge":
            out = self.laid(n, x, y, w, 20)
        elif t == "image":
            ratio = 4 / 3
            rv = attr(n, "ratio")
            m = _RATIO.fullmatch(rv) if isinstance(rv, str) else None
            if m and float(m.group(1)) > 0 and float(m.group(3)) > 0:
                ratio = float(m.group(1)) / float(m.group(3))
            # A fixed height is the image's height (section 10.4), not a limit its content overflows.
            out = self.laid(n, x, y, w, fixed_h if fixed_h is not None else r(_js.div(w, ratio)))
        elif t == "spacer":
            s = attr(n, "size")
            v = float(s) if _js.is_number(s) else self.scale(s, 0) if s is not None else 0.0
            out = self.laid(n, x, y, w, v)
        elif t == "divider":
            out = self.laid(n, x, y, w, self.theme.stroke)
        elif t == "item":
            out = self.laid(n, x, y, w, 9 * u)
        elif t == "breadcrumbs":
            out = self.laid(n, x, y, w, 6 * u)
        elif t == "nav":
            out = self.place_nav(n, x, y, w)
        elif t == "tabs":
            out = self.place_tabs(n, x, y, w)
        elif t == "list":
            out = self.place_list(n, x, y, w)
        elif t == "table":
            out = self.place_table(n, x, y, w)
        elif t == "card":
            p = self.pad(n)
            title_h = 22 + self.gap(n) if "label" in n else 0.0
            inner, inner_h = self.place_column(
                n, self.flow_children(n), x + p, y + p + title_h, w - 2 * p, self.gap(n), "stretch", None
            )
            out = self.laid(n, x, y, w, 2 * p + title_h + inner_h)
            out.children = inner
        elif t in ("empty", "error", "loading"):
            f = self.body(15, 400)
            h = 8 * u + (24 if t == "loading" else 32)
            if "label" in n:
                lines_, _ = wrap(n["label"], f, w)
                h += 2 * u + len(lines_) * 22
            kids = self.flow_children(n)
            children: list[Laid] = []
            if kids and t != "loading":
                h += 4 * u
                children, inner_h = self.place_column(n, kids, x, y + h, w, 4 * u, "center", None)
                h += inner_h
            h += 8 * u
            out = self.laid(n, x, y, w, h)
            out.children = children
        elif t == "swatches":
            out = self.laid(n, x, y, w, 3 * 36 + 2 * 4 * u)
        elif t in ("row", "header", "footer"):
            out = self.place_row(n, x, y, w)
        elif t == "grid":
            out = self.place_grid(n, x, y, w)
        elif t in ("sidebar", "column"):
            p = self.pad(n)
            inner, inner_h = self.place_column(
                n,
                self.flow_children(n),
                x + p,
                y + p,
                w - 2 * p,
                self.gap(n),
                self.align(n),
                fixed_h - 2 * p if fixed_h is not None else None,
            )
            out = self.laid(n, x, y, w, inner_h + 2 * p)
            out.children = inner
        else:
            out = self.laid(n, x, y, w, 0)
        if fixed_h is not None:
            if out.box.h > fixed_h:
                self.warn(
                    "W601",
                    n,
                    f"the content is {_js.number_to_string(r(out.box.h - fixed_h))} px taller than "
                    f"height={_js.number_to_string(fixed_h)}",
                )
            out.box.h = r(fixed_h)
        return out

    def fixed_height(self, n: Node) -> float | None:
        return _num(attr(n, "height"))

    def place_column(
        self,
        owner: Node,
        kids: list[Node],
        x: float,
        y: float,
        w: float,
        gap: float,
        align: str,
        room: float | None,
    ) -> tuple[list[Laid], float]:
        """A vertical container's children (section 10.3, steps 2, 4 and 5)."""
        children: list[Laid] = []
        cy = y
        for c in kids:
            fixed = self.width_in(c, w)
            if fixed is not None:
                cw = fixed
            elif align == "stretch" and c["type"] not in _OWN_WIDTH:
                cw = w
            else:
                cw = min_(self.intrinsic(c)[0], w)
            cx = x
            a = "start" if align == "stretch" else align
            if a == "center":
                cx = x + r((w - cw) / 2)
            elif a == "end":
                cx = x + w - cw
            lay = self.place(c, cx, cy, cw)
            children.append(lay)
            cy += lay.box.h + gap
        h = cy - gap - y if kids else 0.0
        # Free room: shared among spacers without a size and children with grow, else justify.
        if room is not None and room > h:
            free = room - h
            growers = [
                lay
                for lay in children
                if (lay.node["type"] == "spacer" and attr(lay.node, "size") is None) or has(lay.node, "grow")
            ]
            if growers:
                shares = share(free, len(growers))
                shift = 0.0
                for lay in children:
                    lay.box.y = r(lay.box.y + shift)
                    shift_children(lay, 0, shift)
                    gi = next((k for k, g in enumerate(growers) if g is lay), -1)
                    if gi >= 0:
                        add = shares[gi]
                        lay.box.h = r(lay.box.h + add)
                        shift += add
            else:
                offsets = _justify_offsets(self.justify(owner), free, len(children))
                for i, lay in enumerate(children):
                    d = offsets[i]
                    lay.box.y = r(lay.box.y + d)
                    shift_children(lay, 0, d)
            h = room
        return children, h

    def place_row(self, n: Node, x: float, y: float, w: float) -> Laid:
        """A horizontal container (section 10.3, step 3)."""
        u = self.u
        is_bar = n["type"] in ("header", "footer")
        pad_v = 3 * u if is_bar else self.pad(n)
        if is_bar:
            pad_h = self.bar_pad if self.bar_pad is not None else self.pad(n)
        else:
            pad_h = self.pad(n)
        gap = self.gap(n)
        inner_w = w - 2 * pad_h
        kids = self.flow_children(n)
        lines: list[list[Node]] = []
        if has(n, "wrap"):
            line: list[Node] = []
            used = 0.0
            for c in kids:
                cw = self.width_in(c, inner_w)
                if cw is None:
                    cw = self.intrinsic(c)[0]
                if line and used + gap + cw > inner_w:
                    lines.append(line)
                    line = []
                    used = 0.0
                used += (gap if line else 0) + cw
                line.append(c)
            if line:
                lines.append(line)
        else:
            lines.append(kids)
        children: list[Laid] = []
        cy = y + pad_v
        for line in lines:
            placed, line_h = self.place_row_line(n, line, x + pad_h, cy, inner_w, gap)
            children.extend(placed)
            cy += line_h + gap
        content_h = cy - gap - (y + pad_v) if lines else 0.0
        out = self.laid(n, x, y, w, content_h + 2 * pad_v)
        out.children = children
        return out

    def place_row_line(
        self, owner: Node, kids: list[Node], x: float, y: float, inner_w: float, gap: float
    ) -> tuple[list[Laid], float]:
        n = len(kids)
        widths: list[float] = [0.0] * n
        growers: list[int] = []
        flexible: list[int] = []
        used = max_(0, n - 1) * gap
        for i, c in enumerate(kids):
            if c["type"] == "sidebar":
                sw = _num(attr(c, "width"))
                fixed: float | None = sw if sw is not None else 240.0
            else:
                fixed = self.width_in(c, inner_w)
            is_fill = attr(c, "width") == "fill"
            if fixed is not None and not is_fill:
                widths[i] = fixed
            elif is_fill or has(c, "grow") or (c["type"] == "spacer" and attr(c, "size") is None):
                growers.append(i)
            else:
                widths[i] = self.intrinsic(c)[0]
                flexible.append(i)
            used += widths[i]
        free = inner_w - used
        if free >= 0 and growers:
            shares = share(free, len(growers))
            for k, gi in enumerate(growers):
                widths[gi] = shares[k]
            free = 0.0
        elif free < 0:
            # Shrink flexible children by a common factor, to no less than their minimum.
            mins = [self.intrinsic(c)[1] for c in kids]
            active = list(flexible)
            guard = 0
            while guard < n + 1 and active:
                total = _sum([widths[i] for i in active])
                target = total + free
                if total <= 0:
                    break
                factor = max_(0, target / total)
                frozen = False
                for i in active:
                    want = r(widths[i] * factor)
                    mn = mins[i]
                    if want < mn:
                        free += widths[i] - mn
                        widths[i] = mn
                        frozen = True
                if frozen:
                    active = [i for i in active if widths[i] > mins[i]]
                    guard += 1
                    continue
                gained = 0.0
                for i in active:
                    nw = r(widths[i] * factor)
                    gained += widths[i] - nw
                    widths[i] = nw
                free += gained
                break
            if free < 0:
                self.warn(
                    "W601",
                    owner,
                    f"this row is {_js.number_to_string(r(-free))} px too wide for its container",
                )
        # Main-axis positions.
        if growers or free <= 0:
            offsets = [0.0] * n
        else:
            offsets = _justify_offsets(self.justify(owner), free, n)
        children: list[Laid] = []
        cx = x
        for i, c in enumerate(kids):
            lay = self.place(c, cx + offsets[i], y, widths[i])
            children.append(lay)
            cx += widths[i] + gap
        # Cross-axis alignment.
        tallest = 0.0
        for lay in children:
            tallest = max_(tallest, lay.box.h)
        align = self.align(owner)
        for lay in children:
            ct = lay.node["type"]
            if ct in ("sidebar", "divider") or (align == "stretch" and ct in _CONTAINERS):
                lay.box.h = tallest
                continue
            dy = 0.0
            if align == "center":
                dy = r((tallest - lay.box.h) / 2)
            elif align == "end":
                dy = tallest - lay.box.h
            if dy != 0:
                lay.box.y = r(lay.box.y + dy)
                shift_children(lay, 0, dy)
        return children, tallest

    def place_grid(self, n: Node, x: float, y: float, w: float) -> Laid:
        p = self.pad(n)
        g = self.gap(n)
        cols = self.cols(n)
        inner_w = w - 2 * p
        widths = share(inner_w - g * (cols - 1), cols)
        col_x: list[float] = []
        acc = x + p
        for i in range(cols):
            col_x.append(acc)
            acc += widths[i] + g
        children: list[Laid] = []
        col = 0
        row_y = y + p
        row: list[Laid] = []

        def finish_row() -> None:
            nonlocal row_y, row
            tallest = 0.0
            for lay in row:
                tallest = max_(tallest, lay.box.h)
            for lay in row:
                if lay.node["type"] in _CONTAINERS or lay.node["type"] == "image":
                    lay.box.h = tallest
            row_y += tallest + g
            row = []

        for c in self.flow_children(n):
            s = self.span(c, cols)
            if col + s > cols:
                finish_row()
                col = 0
            cw = 0.0
            for k in range(col, col + s):
                cw += widths[k]
            cw += (s - 1) * g
            lay = self.place(c, col_x[col], row_y, cw)
            children.append(lay)
            row.append(lay)
            col += s
        if row:
            finish_row()
        h = row_y - g - (y + p) if children else 0.0
        out = self.laid(n, x, y, w, h + 2 * p)
        out.children = children
        return out

    def place_nav(self, n: Node, x: float, y: float, w: float) -> Laid:
        u = self.u
        entries = self.nav_entries(n)
        nodes = self.nav_nodes(n)
        vertical = has(n, "vertical")
        out = self.laid(n, x, y, w, len(entries) * 9 * u if vertical else 9 * u)
        cx = x
        for i, (text, active, icon) in enumerate(entries):
            if vertical:
                box = Box(r(x), r(y + i * 9 * u), r(w), 9 * u)
            else:
                ew = measure(text, self.body(15, 600 if active else 400)) + (16 + 2 * u if icon else 0)
                box = Box(r(cx), r(y), ew, 9 * u)
                cx += ew + 6 * u
            out.entries.append(box)
            node = nodes[i]
            if node is not None:
                out.children.append(self.laid(node, box.x, box.y, box.w, box.h))
        return out

    def place_tabs(self, n: Node, x: float, y: float, w: float) -> Laid:
        u = self.u
        items = n.get("items", [])
        active = text_of(attr(n, "active"))
        if active is None and items:
            active = items[0]
        out = self.laid(n, x, y, w, 10 * u)
        cx = x
        for tab in items:
            tw = measure(tab, self.body(15, 600 if tab == active else 400)) + 8 * u
            out.entries.append(Box(r(cx), r(y), tw, 10 * u))
            cx += tw
        kids = self.flow_children(n)
        if kids:
            inner, inner_h = self.place_column(n, kids, x, y + 10 * u + 4 * u, w, 4 * u, "stretch", None)
            out.children = inner
            out.box.h = r(10 * u + 4 * u + inner_h)
        return out

    def place_list(self, n: Node, x: float, y: float, w: float) -> Laid:
        u = self.u
        if "items" in n:
            out = self.laid(n, x, y, w, len(n["items"]) * 9 * u)
            out.entries = [Box(r(x), r(y + i * 9 * u), r(w), 9 * u) for i in range(len(n["items"]))]
            return out
        children: list[Laid] = []
        cy = y
        for c in self.flow_children(n):
            lay = self.place(c, x, cy, w)
            children.append(lay)
            cy += lay.box.h
        out = self.laid(n, x, y, w, cy - y)
        out.children = children
        return out

    def place_table(self, n: Node, x: float, y: float, w: float) -> Laid:
        u = self.u
        caption_h = 22 + 2 * u if "label" in n else 0.0
        rows_attr = _num(attr(n, "rows"))
        row_nodes = [c for c in n.get("children", []) if c["type"] == "table-row"]
        if row_nodes:
            body_rows: float = len(row_nodes)
        elif rows_attr is not None and _js.is_integer(rows_attr) and 1 <= rows_attr <= 100:
            body_rows = rows_attr
        else:
            body_rows = 3
        out = self.laid(n, x, y, w, caption_h + 10 * u * (1 + body_rows))
        out.table_top = r(y + caption_h)
        for i, rn in enumerate(row_nodes):
            out.children.append(self.laid(rn, x, y + caption_h + 10 * u * (1 + i), w, 10 * u))
        return out

    # ---- screens ------------------------------------------------------------------------------

    def device(self, s: Node) -> tuple[str, float, float]:
        """The device of a screen: its name, width and height."""
        size = attr(s, "size")
        m = _SCREEN_SIZE.fullmatch(size) if isinstance(size, str) else None
        if m and 1 <= int(m.group(1)) <= 16000 and 1 <= int(m.group(2)) <= 16000:
            return "custom", float(m.group(1)), float(m.group(2))
        for d in ("phone", "tablet", "desktop"):
            if has(s, d):
                return d, float(DEVICES[d][0]), float(DEVICES[d][1])
        # A variant uses its base's device.
        of = attr(s, "of")
        if is_ref(of):
            base = next((b for b in self.doc["screens"] if b.get("id") == of["ref"]), None)
            if base is not None and base is not s:
                return self.device(base)
        return "desktop", 1280.0, 800.0

    def frame(self, s: Node, key: str, open_: list[Node], extra: Node | None = None) -> Frame:
        """Lays out a screen's frame, with the given overlays open."""
        u = self.u
        dev_name, dev_w, dev_h = self.device(s)
        W = dev_w
        P = 4 * u if dev_name == "phone" else 6 * u
        kids = s.get("children", [])
        header_n = next((c for c in kids if c["type"] == "header"), None)
        footer_n = next((c for c in kids if c["type"] == "footer"), None)
        left = next((c for c in kids if c["type"] == "sidebar" and not has(c, "right")), None)
        right = next((c for c in kids if c["type"] == "sidebar" and has(c, "right")), None)
        body_kids = [
            c
            for c in kids
            if c is not header_n
            and c is not footer_n
            and c is not left
            and c is not right
            and c["type"] != "note"
            and c["type"] not in OVERLAYS
        ]

        self.bar_pad = P
        header = self.place(header_n, 0, 0, W) if header_n is not None else None
        footer_probe = self.place(footer_n, 0, 0, W) if footer_n is not None else None
        self.bar_pad = None
        header_h = header.box.h if header is not None else 0.0
        footer_h = footer_probe.box.h if footer_probe is not None else 0.0
        lw = 0.0
        if left is not None:
            v = _num(attr(left, "width"))
            lw = v if v is not None else 240.0
        rw = 0.0
        if right is not None:
            v = _num(attr(right, "width"))
            rw = v if v is not None else 240.0
        body_w = max_(0, W - lw - rw)
        room = max_(0, dev_h - header_h - footer_h - 2 * P)
        body, body_h = self.place_column(
            s, body_kids, lw + P, header_h + P, body_w - 2 * P, 4 * u, "stretch", room
        )
        body_h = body_h + 2 * P
        frame_h = r(max_(dev_h, header_h + body_h + footer_h))
        footer: Laid | None = None
        if footer_n is not None:
            self.bar_pad = P
            footer = self.place(footer_n, 0, frame_h - footer_h, W)
            self.bar_pad = None
        side_h = frame_h - header_h - footer_h
        sidebars: list[Laid] = []
        for sb, sx, sw in ((left, 0.0, lw), (right, W - rw, rw)):
            if sb is None:
                continue
            lay = self.place(sb, sx, header_h, sw)
            lay.box.h = r(side_h)
            sidebars.append(lay)

        open_laid: list[Laid] = []
        overlay: Laid | None = None
        for o in open_:
            lay = self.place_overlay(o, W, frame_h, dev_h)
            open_laid.append(lay)
            if o is extra:
                overlay = lay

        return Frame(
            key=key,
            screen=s,
            w=W,
            h=frame_h,
            device_h=dev_h,
            open=open_laid,
            sidebars=sidebars,
            body=body,
            header=header,
            footer=footer,
            overlay=overlay,
        )

    def place_overlay(self, o: Node, W: float, frame_h: float, device_h: float) -> Laid:
        u = self.u
        p = 6 * u
        kids = self.flow_children(o)
        if o["type"] == "modal":
            mw = _num(attr(o, "width"))
            want = mw if mw is not None else 480.0
            w = min_(want, W - 8 * u)
            x = r((W - w) / 2)
            _inner, inner_h = self.place_column(o, kids, x + p, 0, w - 2 * p, 4 * u, "stretch", None)
            h = p + 24 + (4 * u + inner_h if kids else 0) + p
            y = max_(4 * u, r((device_h - h) / 2))
            placed, _ = self.place_column(
                o, kids, x + p, y + p + 24 + 4 * u, w - 2 * p, 4 * u, "stretch", None
            )
            lay = self.laid(o, x, y, w, h)
            lay.children = placed
            return lay
        bottom = has(o, "bottom")
        is_left = has(o, "left") and not has(o, "right")
        if bottom:
            h = r(device_h * 0.5)
            box = Box(0.0, r(frame_h - h), W, h)
        else:
            dw = _num(attr(o, "width"))
            w = min_(dw if dw is not None else 360.0, W)
            box = Box(0.0 if is_left else r(W - w), 0.0, w, frame_h)
        placed, _ = self.place_column(
            o, kids, box.x + p, box.y + p + 24 + 4 * u, box.w - 2 * p, 4 * u, "stretch", None
        )
        lay = self.laid(o, box.x, box.y, box.w, box.h)
        lay.children = placed
        return lay
