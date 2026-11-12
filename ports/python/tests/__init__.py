# SPDX-License-Identifier: MIT

"""Tests for the wirelith package. They import it from ../src, so no install is needed."""

import sys
from pathlib import Path

_SRC = str(Path(__file__).resolve().parents[1] / "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)
