# SPDX-License-Identifier: MIT

"""Small helpers that reproduce JavaScript behaviour the reference implementation relies on.

The reference implementation is written in TypeScript. Where Python and JavaScript differ in a
way that changes a result (number formatting, trimming, integer checks, UTF-16 lengths), these
helpers give the JavaScript answer.
"""

from __future__ import annotations

import math
from typing import Any

# The characters String.prototype.trim removes: WhiteSpace and LineTerminator.
_JS_SPACE = frozenset(
    chr(c)
    for c in (
        *range(0x09, 0x0E),  # tab, line feed, vertical tab, form feed, carriage return
        0x20,
        0xA0,
        0x1680,
        *range(0x2000, 0x200B),
        0x2028,
        0x2029,
        0x202F,
        0x205F,
        0x3000,
        0xFEFF,
    )
)


def trim(s: str) -> str:
    """String.prototype.trim."""
    start = 0
    end = len(s)
    while start < end and s[start] in _JS_SPACE:
        start += 1
    while end > start and s[end - 1] in _JS_SPACE:
        end -= 1
    return s[start:end]


def trim_end(s: str) -> str:
    """String.prototype.trimEnd."""
    end = len(s)
    while end > 0 and s[end - 1] in _JS_SPACE:
        end -= 1
    return s[:end]


def is_number(v: Any) -> bool:
    """typeof v === 'number' (booleans are not numbers)."""
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def is_integer(v: Any) -> bool:
    """Number.isInteger: true for 2 and 2.0, false for infinities and NaN."""
    if isinstance(v, bool):
        return False
    if isinstance(v, int):
        return True
    return isinstance(v, float) and math.isfinite(v) and v.is_integer()


def number(text: str) -> int | float:
    """Number(text) for text that matches -?[0-9]+(\\.[0-9]+)?, kept as an int when whole.

    Whole values are kept as ints so that the tree reads naturally in Python; they are exactly
    the double JavaScript would hold. Values too large for a double become infinity.
    """
    v = float(text)
    if math.isfinite(v) and v.is_integer():
        return int(v)
    return v


def trunc(v: float) -> float:
    """Math.trunc, which keeps infinities."""
    if not math.isfinite(v):
        return v
    return float(math.trunc(v))


def floor(v: float) -> float:
    """Math.floor, which keeps infinities and NaN."""
    if not math.isfinite(v):
        return v
    return float(math.floor(v))


def number_to_string(v: int | float) -> str:
    """Number.prototype.toString() with no radix, as String(v) gives it."""
    if isinstance(v, int) and not isinstance(v, bool):
        if abs(v) < 10**21:
            return str(v)
        v = float(v)
    if math.isnan(v):
        return "NaN"
    if math.isinf(v):
        return "Infinity" if v > 0 else "-Infinity"
    if v == 0:
        return "0"
    sign = "-" if v < 0 else ""
    # repr gives the shortest digits that round-trip, as JavaScript does.
    text = repr(abs(v))
    mantissa, _, exp_text = text.partition("e")
    exp = int(exp_text) if exp_text else 0
    whole, _, frac = mantissa.partition(".")
    if frac == "0":
        frac = ""
    digits = (whole + frac).lstrip("0")
    # The position of the decimal point relative to the start of `digits`.
    point = len(whole) + exp - (len(whole + frac) - len((whole + frac).lstrip("0")))
    digits = digits.rstrip("0") or "0"
    k = len(digits)
    n = point
    if k <= n <= 21:
        out = digits + "0" * (n - k)
    elif 0 < n <= 21:
        out = digits[:n] + "." + digits[n:]
    elif -6 < n <= 0:
        out = "0." + "0" * (-n) + digits
    else:
        e = n - 1
        out = digits[0] + ("." + digits[1:] if k > 1 else "") + "e" + ("+" if e >= 0 else "-") + str(abs(e))
    return sign + out


def to_string(v: Any) -> str:
    """String(v) for a JSON value."""
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if is_number(v):
        return number_to_string(v)
    if isinstance(v, str):
        return v
    if isinstance(v, list):
        return ",".join("" if x is None else to_string(x) for x in v)
    return "[object Object]"


def utf16_units(s: str) -> list[int]:
    """The UTF-16 code units of a string, for code that indexes strings as JavaScript does."""
    b = s.encode("utf-16-le", "surrogatepass")
    return [b[i] | (b[i + 1] << 8) for i in range(0, len(b), 2)]


def to_json(v: Any) -> Any:
    """A value as JSON.stringify would write it: whole numbers as integers, -0 as 0, and
    infinities and NaN as null."""
    if isinstance(v, bool) or v is None or isinstance(v, (str, int)):
        return v
    if isinstance(v, float):
        if not math.isfinite(v):
            return None
        if v.is_integer():
            return int(v)
        return v
    if isinstance(v, list):
        return [to_json(x) for x in v]
    if isinstance(v, dict):
        return {k: to_json(x) for k, x in v.items()}
    return v


def max_(*xs: float) -> float:
    """Math.max: NaN when any argument is NaN, and -infinity with no arguments."""
    out = -math.inf
    for x in xs:
        if x != x:
            return math.nan
        if x > out or (x == 0 and out == 0 and math.copysign(1.0, out) < 0):
            out = x
    return out


def min_(*xs: float) -> float:
    """Math.min: NaN when any argument is NaN, and infinity with no arguments."""
    out = math.inf
    for x in xs:
        if x != x:
            return math.nan
        if x < out or (x == 0 and out == 0 and math.copysign(1.0, x) < 0):
            out = x
    return out


def div(a: float, b: float) -> float:
    """a / b with JavaScript's results for a zero divisor: an infinity, or NaN for 0 / 0."""
    if b == 0:
        if a == 0 or a != a:
            return math.nan
        return math.copysign(math.inf, a) * math.copysign(1.0, b)
    return a / b
