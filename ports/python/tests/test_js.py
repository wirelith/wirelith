# SPDX-License-Identifier: MIT

"""The helpers that reproduce JavaScript behaviour."""

import unittest

from wirelith import _js


class NumberToStringTest(unittest.TestCase):
    def test_matches_javascript(self) -> None:
        cases = {
            2.0: "2",
            1.5: "1.5",
            0.001: "0.001",
            1e-7: "1e-7",
            1e16: "10000000000000000",
            1e21: "1e+21",
            -0.5: "-0.5",
            0.1 + 0.2: "0.30000000000000004",
            float("inf"): "Infinity",
        }
        for value, text in cases.items():
            with self.subTest(value=value):
                self.assertEqual(_js.number_to_string(value), text)

    def test_trim_uses_javascript_white_space(self) -> None:
        self.assertEqual(_js.trim("\ufeff a \u00a0"), "a")
        self.assertEqual(_js.trim("\x85a"), "\x85a")


if __name__ == "__main__":
    unittest.main()
