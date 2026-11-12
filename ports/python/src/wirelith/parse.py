# SPDX-License-Identifier: MIT

"""The parser (spec sections 3 and 4).

It reads a source line by line and builds the syntax tree (section 13). A line with a syntax
error is reported, then skipped together with its children, and parsing continues, so that
every error can be reported at once.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from . import _js
from .components import COMPONENTS, SYNONYMS, WRITTEN_NAMES, closest

SPEC_VERSION = "0.1"
MAX_SOURCE_BYTES = 65536

Diagnostic = dict[str, Any]
Node = dict[str, Any]

_BARE = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.:%/")
_ID_START = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz")
_ID_REST = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-")
NUMBER = re.compile(r"-?[0-9]+(\.[0-9]+)?")
_VERSION = re.compile(r"[0-9]+\.[0-9]+")
_LINE_BREAK = re.compile(r"\r\n|\n|\r")


def is_number_text(s: str) -> bool:
    """Whether a bare word is a number (spec section 3)."""
    return NUMBER.fullmatch(s) is not None


def diagnostic(code: str, line: int, column: int, message: str, hint: str | None = None) -> Diagnostic:
    """A diagnostic. Codes starting with E are errors; the rest are warnings."""
    d: Diagnostic = {
        "code": code,
        "severity": "error" if code.startswith("E") else "warning",
        "line": line,
        "column": column,
        "message": message,
    }
    if hint is not None:
        d["hint"] = hint
    return d


def normalize_source(source: str) -> str:
    """Applies the decoding rules of section 3: drops a byte-order mark and replaces lone
    surrogates with U+FFFD. A surrogate pair written as two code points is joined."""
    s = source[1:] if source.startswith("﻿") else source
    if any("\ud800" <= ch <= "\udfff" for ch in s):
        s = s.encode("utf-16-le", "surrogatepass").decode("utf-16-le", "replace")
    return s


def utf8_length(s: str) -> int:
    """The number of bytes the string takes in UTF-8."""
    return len(s.encode("utf-8"))


@dataclass
class Token:
    """One part of a line."""

    kind: str  # word, string, list, id, arrow or attr
    col: int
    text: str = ""
    items: list[str] = field(default_factory=list)
    key: str = ""
    value: Any = None


class LineError(Exception):
    """A syntax error on one line, at a column."""

    def __init__(self, code: str, col: int, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.col = col
        self.message = message


def tokenize(cp: str, start: int, line: int, info: dict[str, str] | None = None) -> list[Token]:
    """Splits the content of one line, from index `start`, into tokens. When `info` is given,
    a trailing comment's text is put in info["comment"]."""
    tokens: list[Token] = []
    n = len(cp)
    i = start

    def at(k: int) -> str:
        return cp[k] if 0 <= k < n else ""

    def end_of_part(k: int) -> bool:
        return k >= n or cp[k] == " "

    def read_string() -> str:
        nonlocal i
        start_col = i + 1
        i += 1  # opening quote
        out: list[str] = []
        while True:
            if i >= n:
                raise LineError(
                    "E104", start_col, f"Line {line}, column {start_col}: this string has no closing quote"
                )
            c = cp[i]
            if c == '"':
                i += 1
                return "".join(out)
            if c == "\\":
                nx = at(i + 1)
                if nx in ('"', "\\"):
                    out.append(nx)
                elif nx == "n":
                    out.append("\n")
                else:
                    col = i + 1
                    raise LineError(
                        "E106",
                        col,
                        f'Line {line}, column {col}: "\\{nx}" is not an escape; use \\", \\\\ or \\n',
                    )
                i += 2
                continue
            out.append(c)
            i += 1

    def read_list() -> list[str]:
        nonlocal i
        start_col = i + 1
        i += 1  # [
        items: list[str] = []
        k = i
        while at(k) == " ":
            k += 1
        if at(k) == "]":
            i = k + 1
            return items
        while True:
            while at(i) == " ":
                i += 1
            if i >= n:
                raise LineError(
                    "E104", start_col, f"Line {line}, column {start_col}: this list has no closing bracket"
                )
            if at(i) == '"':
                item = read_string()
                while at(i) == " ":
                    i += 1
            else:
                item_col = i + 1
                raw_start = i
                while i < n and cp[i] not in ',]["':
                    i += 1
                raw = cp[raw_start:i]
                if at(i) in ('"', "["):
                    col = i + 1
                    raise LineError(
                        "E106",
                        col,
                        f'Line {line}, column {col}: quote the whole item, or leave out the "{at(i)}"',
                    )
                item = _js.trim(raw)
                if item == "" and i < n:
                    raise LineError(
                        "E106", item_col, f"Line {line}, column {item_col}: this list has an empty item"
                    )
            if i >= n:
                raise LineError(
                    "E104", start_col, f"Line {line}, column {start_col}: this list has no closing bracket"
                )
            items.append(item)
            if at(i) == ",":
                i += 1
                continue
            if at(i) == "]":
                i += 1
                return items
            col = i + 1
            raise LineError(
                "E106", col, f'Line {line}, column {col}: expected "," or "]" after a quoted item'
            )

    def read_id() -> str:
        nonlocal i
        start_col = i + 1
        i += 1  # #
        if at(i) not in _ID_START or at(i) == "":
            raise LineError(
                "E106",
                start_col,
                f"Line {line}, column {start_col}: an id is # then a letter, then letters, digits, - or _",
            )
        id_start = i
        while i < n and cp[i] in _ID_REST:
            i += 1
        return cp[id_start:i]

    def read_bare() -> str:
        nonlocal i
        word_start = i
        while i < n and cp[i] in _BARE:
            i += 1
        return cp[word_start:i]

    def require_end() -> None:
        if not end_of_part(i):
            col = i + 1
            raise LineError(
                "E106",
                col,
                f'Line {line}, column {col}: unexpected "{at(i)}"; put a space between parts, and quote text',
            )

    while i < n:
        if cp[i] == " ":
            i += 1
            continue
        # A trailing comment: "//" after at least one space.
        if cp[i] == "/" and at(i + 1) == "/" and i > start and at(i - 1) == " ":
            if info is not None:
                info["comment"] = _js.trim_end(cp[i:])
            break
        c = i + 1
        ch = cp[i]
        if ch == '"':
            tokens.append(Token("string", c, text=read_string()))
            require_end()
        elif ch == "[":
            tokens.append(Token("list", c, items=read_list()))
            require_end()
        elif ch == "#":
            tokens.append(Token("id", c, text=read_id()))
            require_end()
        elif ch == "-" and at(i + 1) == ">" and end_of_part(i + 2):
            i += 2
            tokens.append(Token("arrow", c))
        elif ch in _BARE:
            word = read_bare()
            if at(i) == "=":
                i += 1
                vc = i + 1
                value: Any
                if end_of_part(i):
                    raise LineError("E106", vc, f'Line {line}, column {vc}: expected a value after "{word}="')
                if cp[i] == '"':
                    value = read_string()
                elif cp[i] == "[":
                    value = read_list()
                elif cp[i] == "#":
                    value = {"ref": read_id()}
                elif cp[i] in _BARE:
                    b = read_bare()
                    value = _js.number(b) if is_number_text(b) else b
                else:
                    raise LineError(
                        "E106", vc, f"""Line {line}, column {vc}: "{cp[i]}" can't start a value; quote it"""
                    )
                require_end()
                tokens.append(Token("attr", c, key=word, value=value))
            else:
                require_end()
                tokens.append(Token("word", c, text=word))
        else:
            raise LineError(
                "E106", c, f"""Line {line}, column {c}: "{ch}" can't appear here; put text in double quotes"""
            )
    return tokens


def _build_element(tokens: list[Token], line: int, type_: str) -> Node:
    """Builds an element from the tokens of one line. Raises LineError on a malformed line."""
    first = tokens[0] if tokens else None
    loc = {"line": line, "column": first.col if first else 1}
    label: str | None = None
    items: list[str] | None = None
    id_: str | None = None
    flags: list[str] = []
    attrs: dict[str, Any] = {}
    link: dict[str, str] | None = None
    k = 1
    while k < len(tokens):
        t = tokens[k]
        if t.kind == "arrow":
            target = tokens[k + 1] if k + 1 < len(tokens) else None
            if target is None or target.kind != "id":
                raise LineError(
                    "E106", t.col, f'Line {line}, column {t.col}: "->" needs a target id, such as -> #home'
                )
            link = {"to": target.text}
            lab = tokens[k + 2] if k + 2 < len(tokens) else None
            has_label = lab is not None and lab.kind == "string"
            if has_label and lab is not None:
                link["label"] = lab.text
            e = k + (3 if has_label else 2)
            extra = tokens[e] if e < len(tokens) else None
            if extra is not None:
                raise LineError(
                    "E106", extra.col, f"Line {line}, column {extra.col}: the link must come last on the line"
                )
            break
        if t.kind == "string":
            if label is not None:
                raise LineError("E106", t.col, f"Line {line}, column {t.col}: an element has only one label")
            label = t.text
        elif t.kind == "list":
            if items is not None:
                raise LineError("E106", t.col, f"Line {line}, column {t.col}: an element has only one list")
            items = t.items
        elif t.kind == "id":
            if id_ is not None:
                raise LineError("E106", t.col, f"Line {line}, column {t.col}: an element has only one id")
            id_ = t.text
        elif t.kind == "word":
            if t.text not in flags:
                flags.append(t.text)
        elif t.kind == "attr":
            attrs[t.key] = t.value
        k += 1
    # Members in schema order: type, id, label, items, flags, attrs, link, children, loc.
    out: Node = {"type": type_}
    if id_ is not None:
        out["id"] = id_
    if label is not None:
        out["label"] = label
    if items is not None:
        out["items"] = items
    if flags:
        out["flags"] = flags
    if attrs:
        out["attrs"] = attrs
    if link is not None:
        out["link"] = link
    out["loc"] = loc
    return out


@dataclass
class _Frame:
    level: int
    kind: str  # skip, node, leafless or theme-block
    node: Node | None = None


@dataclass
class ParseResult:
    """The result of parsing a source."""

    tree: dict[str, Any]
    diagnostics: list[Diagnostic]
    too_large: bool
    """True when the source-size cap was exceeded and nothing else was read."""
    token_lines: dict[str, int]
    """The line of each token in the source's theme block."""


def _is_banned(ch: str) -> bool:
    v = ord(ch)
    return (v < 0x20 and v not in (0x0A, 0x0D)) or v in (0x7F, 0xFFFE, 0xFFFF)


def parse_source(source: str) -> ParseResult:
    """Parses a source into its syntax tree and the syntax diagnostics."""
    text = normalize_source(source)
    diagnostics: list[Diagnostic] = []
    tree: dict[str, Any] = {"type": "document", "version": SPEC_VERSION, "screens": []}
    size = utf8_length(text)
    if size > MAX_SOURCE_BYTES:
        diagnostics.append(
            diagnostic("E701", 1, 1, f"This source is {size:,} bytes; the limit is {MAX_SOURCE_BYTES:,}")
        )
        return ParseResult(tree, diagnostics, True, {})

    lines = _LINE_BREAK.split(text)
    flows: list[dict[str, Any]] = []
    theme: dict[str, Any] | None = None
    theme_line = 0
    saw_significant = False
    stack: list[_Frame] = []
    token_lines: dict[str, int] = {}

    def fail(e: LineError, line_no: int, level: int) -> None:
        diagnostics.append(diagnostic(e.code, line_no, e.col, e.message))
        stack.append(_Frame(level, "skip"))

    for index, cp in enumerate(lines):
        line_no = index + 1
        indent = 0
        while indent < len(cp) and cp[indent] == " ":
            indent += 1
        if indent == len(cp):
            continue  # blank
        rest = cp[indent]
        if rest == "\t":
            diagnostics.append(
                diagnostic("E102", line_no, indent + 1, f"Line {line_no}: use 2 spaces, not a tab")
            )
            _push_skip(stack, indent // 2)
            continue
        bad = next((k for k, ch in enumerate(cp) if _is_banned(ch)), -1)
        if bad >= 0:
            v = ord(cp[bad])
            diagnostics.append(
                diagnostic(
                    "E106",
                    line_no,
                    bad + 1,
                    f"Line {line_no}, column {bad + 1}: the character U+{v:04X} is not allowed in a source",
                )
            )
            _push_skip(stack, indent // 2)
            continue
        if rest == "/" and indent + 1 < len(cp) and cp[indent + 1] == "/":
            continue  # comment line
        if indent % 2 != 0:
            diagnostics.append(
                diagnostic("E101", line_no, 1, f"Line {line_no}: indentation must be a multiple of 2 spaces")
            )
            _push_skip(stack, indent // 2)
            continue
        level = indent // 2
        while stack and stack[-1].level >= level:
            stack.pop()
        parent = stack[-1] if stack else None
        col = indent + 1

        if parent is not None and level > parent.level + 1:
            diagnostics.append(
                diagnostic(
                    "E101",
                    line_no,
                    col,
                    f"Line {line_no}: this line is indented more than one level below the line above it",
                )
            )
            stack.append(_Frame(level, "skip"))
            continue
        if parent is None and level > 0:
            diagnostics.append(
                diagnostic(
                    "E101",
                    line_no,
                    col,
                    f"Line {line_no}: this line is indented, but there is nothing above it to belong to",
                )
            )
            stack.append(_Frame(level, "skip"))
            continue
        if parent is not None and parent.kind == "skip":
            stack.append(_Frame(level, "skip"))
            continue

        # A token line in a theme block.
        if parent is not None and parent.kind == "theme-block":
            k = indent
            while k < len(cp) and cp[k] != " ":
                k += 1
            token = cp[indent:k]
            value_text = cp[k:]
            comment = value_text.find(" //")
            if comment >= 0:
                value_text = value_text[:comment]
            value_text = _js.trim(value_text)
            if value_text == "":
                diagnostics.append(
                    diagnostic("E106", line_no, k + 1, f'Line {line_no}: expected a value after "{token}"')
                )
                stack.append(_Frame(level, "skip"))
                continue
            if theme is not None:
                tokens_map = theme.setdefault("tokens", {})
                tokens_map[token] = _js.number(value_text) if is_number_text(value_text) else value_text
                token_lines[token] = line_no
            stack.append(_Frame(level, "skip"))
            continue

        try:
            tokens = tokenize(cp, indent, line_no)
        except LineError as e:
            fail(e, line_no, level)
            continue
        head = tokens[0] if tokens else None
        name = head.text if head is not None and head.kind == "word" else ""
        is_first = not saw_significant
        saw_significant = True

        if level == 0:
            if name == "wirelith":
                if not is_first:
                    diagnostics.append(
                        diagnostic(
                            "E105",
                            line_no,
                            col,
                            f'Line {line_no}: "wirelith {SPEC_VERSION}" must be the first line',
                        )
                    )
                else:
                    _read_header(tokens, line_no, tree, diagnostics)
                    if any(d["code"] == "E103" for d in diagnostics):
                        return ParseResult(tree, diagnostics, False, token_lines)
                stack.append(_Frame(level, "leafless"))
                continue
            if name == "theme":
                if theme is not None:
                    diagnostics.append(
                        diagnostic(
                            "E501",
                            line_no,
                            col,
                            f"Line {line_no}: a source can have only one theme; "
                            f"the first is on line {theme_line}",
                        )
                    )
                    stack.append(_Frame(level, "skip"))
                    continue
                try:
                    decl, block = _read_theme(tokens, line_no)
                except LineError as e:
                    fail(e, line_no, level)
                    continue
                theme = decl
                theme_line = line_no
                stack.append(_Frame(level, "theme-block" if block else "leafless"))
                continue
            if name == "flow":
                try:
                    flows.append(_read_flow(tokens, line_no))
                except LineError as e:
                    fail(e, line_no, level)
                    continue
                stack.append(_Frame(level, "leafless"))
                continue
            if name != "screen":
                what = name or "this line"
                diagnostics.append(
                    diagnostic(
                        "E105",
                        line_no,
                        col,
                        f'Line {line_no}: "{what}" must be inside a screen; '
                        "only screen, theme and flow go at the top level",
                    )
                )
                stack.append(_Frame(level, "skip"))
                continue
        elif parent is not None and parent.kind == "leafless":
            diagnostics.append(
                diagnostic("E204", line_no, col, f"Line {line_no}: the line above cannot contain other lines")
            )
            stack.append(_Frame(level, "skip"))
            continue

        # An element.
        if head is None or head.kind != "word":
            diagnostics.append(
                diagnostic(
                    "E106",
                    line_no,
                    col,
                    f"Line {line_no}: a line starts with a component name, such as button or text",
                )
            )
            stack.append(_Frame(level, "skip"))
            continue
        type_ = name
        if type_ not in COMPONENTS or type_ == "table-row" or (level > 0 and type_ == "screen"):
            if type_ == "screen":
                diagnostics.append(
                    diagnostic("E203", line_no, col, f'Line {line_no}: "screen" must be at the top level')
                )
            else:
                guess = SYNONYMS.get(type_.lower()) or closest(type_, WRITTEN_NAMES)
                diagnostics.append(
                    diagnostic(
                        "E201",
                        line_no,
                        col,
                        f'Line {line_no}: there is no "{type_}".'
                        + (f' Did you mean "{guess}"?' if guess else ""),
                        f'Use "{guess}".'
                        if guess
                        else "See the list of components in the specification, section 5.",
                    )
                )
            stack.append(_Frame(level, "skip"))
            continue
        if (
            type_ == "row"
            and parent is not None
            and parent.node is not None
            and parent.node["type"] == "table"
        ):
            type_ = "table-row"
        try:
            node = _build_element(tokens, line_no, type_)
        except LineError as e:
            fail(e, line_no, level)
            continue
        node["loc"] = {"line": line_no, "column": col}
        if level == 0:
            tree["screens"].append(node)
        elif parent is not None and parent.node is not None:
            # Children are kept even under components that take none; validation reports E204.
            _insert_child(parent.node, node)
        stack.append(_Frame(level, "node", node))

    out: dict[str, Any] = {"type": "document", "version": tree["version"]}
    if theme is not None:
        # Members in schema order: name, extends, tokens, loc.
        t: dict[str, Any] = {"name": theme["name"]}
        if "extends" in theme:
            t["extends"] = theme["extends"]
        if "tokens" in theme:
            t["tokens"] = theme["tokens"]
        if "loc" in theme:
            t["loc"] = theme["loc"]
        out["theme"] = t
    out["screens"] = tree["screens"]
    if flows:
        out["flows"] = flows
    return ParseResult(out, diagnostics, False, token_lines)


def _insert_child(parent: Node, child: Node) -> None:
    """Adds a child, keeping `children` before `loc` in member order."""
    if "children" in parent:
        parent["children"].append(child)
        return
    loc = parent.pop("loc")
    parent["children"] = [child]
    parent["loc"] = loc


def _push_skip(stack: list[_Frame], level: int) -> None:
    while stack and stack[-1].level >= level:
        stack.pop()
    stack.append(_Frame(level, "skip"))


def _read_header(tokens: list[Token], line: int, tree: dict[str, Any], diagnostics: list[Diagnostic]) -> None:
    v = tokens[1] if len(tokens) > 1 else None
    extra = tokens[2] if len(tokens) > 2 else None
    if v is None or v.kind != "word" or _VERSION.fullmatch(v.text) is None or extra is not None:
        at = extra or v or (tokens[0] if tokens else None)
        col = at.col if at is not None else 1
        diagnostics.append(
            diagnostic("E106", line, col, f'Line {line}: write the version as "wirelith {SPEC_VERSION}"')
        )
        return
    major_text, minor_text = v.text.split(".")
    major, minor = float(major_text), float(minor_text)
    tree["version"] = v.text
    our_major, our_minor = (float(x) for x in SPEC_VERSION.split("."))
    if major > our_major:
        diagnostics.append(
            diagnostic(
                "E103",
                line,
                v.col,
                f"This source targets Wirelith {v.text}; this renderer supports {SPEC_VERSION}",
            )
        )
    elif major == our_major and minor > our_minor:
        diagnostics.append(
            diagnostic("W101", line, v.col, f"This source targets {v.text}; rendering as {SPEC_VERSION}")
        )


def _read_theme(tokens: list[Token], line: int) -> tuple[dict[str, Any], bool]:
    name_tok = tokens[1] if len(tokens) > 1 else None
    loc = {"line": line, "column": tokens[0].col if tokens else 1}
    if name_tok is not None and name_tok.kind == "word" and len(tokens) == 2:
        return {"name": name_tok.text, "loc": loc}, False
    if name_tok is not None and name_tok.kind == "string":
        theme: dict[str, Any] = {"name": name_tok.text, "tokens": {}}
        for t in tokens[2:]:
            if (
                t.kind == "attr"
                and t.key == "extends"
                and isinstance(t.value, str)
                and "extends" not in theme
            ):
                theme["extends"] = t.value
            else:
                raise LineError(
                    "E106",
                    t.col,
                    f"Line {line}, column {t.col}: a theme block takes only a name and extends=",
                )
        theme["loc"] = loc
        return theme, True
    col = name_tok.col if name_tok is not None else loc["column"]
    raise LineError(
        "E106",
        col,
        f'Line {line}: write "theme paper", or "theme "name" extends=paper" with token lines below',
    )


def _read_flow(tokens: list[Token], line: int) -> dict[str, Any]:
    parts: list[Token | None] = [tokens[k] if k < len(tokens) else None for k in range(1, 6)]
    from_, arrow, to, label, extra = parts
    loc = {"line": line, "column": tokens[0].col if tokens else 1}
    if (
        from_ is None
        or from_.kind != "id"
        or arrow is None
        or arrow.kind != "arrow"
        or to is None
        or to.kind != "id"
        or (label is not None and label.kind != "string")
        or extra is not None
    ):
        at = extra or label or to or arrow or from_ or (tokens[0] if tokens else None)
        col = at.col if at is not None else 1
        raise LineError("E106", col, f'Line {line}: write a flow as flow #from -> #to "optional label"')
    if label is not None:
        return {"from": from_.text, "to": to.text, "label": label.text, "loc": loc}
    return {"from": from_.text, "to": to.text, "loc": loc}
