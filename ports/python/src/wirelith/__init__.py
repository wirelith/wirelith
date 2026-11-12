# SPDX-License-Identifier: MIT

"""A parser and validator for Wirelith, a plain-text language for low-fidelity wireframes.

>>> from wirelith import parse, validate
>>> parse('screen "Home"')["tree"]["screens"][0]["label"]
'Home'
>>> validate('screen "Home"\\n  buton "Save"')[0]["code"]
'E201'
"""

from __future__ import annotations

from .api import parse, validate
from .parse import SPEC_VERSION

__all__ = ["SPEC_VERSION", "parse", "validate"]
__version__ = "0.1.0"
