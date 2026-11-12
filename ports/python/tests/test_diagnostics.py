# SPDX-License-Identifier: MIT

"""Diagnostics: codes, positions and order, including the layout and theme warnings."""

import unittest
from typing import Any

from wirelith import validate


def found(source: str, **options: Any) -> list[tuple[str, int, int]]:
    return [(d["code"], d["line"], d["column"]) for d in validate(source, **options)]


class SyntaxTest(unittest.TestCase):
    def test_tab_skips_the_rest_of_its_screen(self) -> None:
        source = 'screen "Home"\n\tbutton "x"\n   text "odd"\n  button "Save"\n'
        self.assertEqual(found(source), [("E102", 2, 1), ("E101", 3, 1)])

    def test_unknown_component_has_a_hint(self) -> None:
        d = validate('screen "Home"\n  buton "Save"\n')
        self.assertEqual([(x["code"], x["line"], x["column"]) for x in d], [("E201", 2, 3)])
        self.assertEqual(d[0]["severity"], "error")
        self.assertEqual(d[0]["hint"], 'Use "button".')

    def test_errors_point_at_the_wrong_part(self) -> None:
        source = 'screen "Home"\n  text "open\n  input [a, , b]\n  button "A" "B"\n'
        self.assertEqual(found(source), [("E104", 2, 8), ("E106", 3, 13), ("E106", 4, 14)])

    def test_references(self) -> None:
        source = (
            'screen "Home" #home\n  button "Go" -> #nowhere\n  text "Hi" #t\n'
            'screen "Two" #two\n  text "Hi" #t\n'
        )
        self.assertEqual(found(source), [("E401", 2, 3), ("W403", 4, 1), ("E301", 5, 3)])

    def test_warnings_share_one_position_per_code(self) -> None:
        source = (
            'screen "Home" #home\n'
            '  button "Go" bogus width=wide icon=serch\n'
            '  tabs [One, Two] active="Three"\n'
            '  button "Next" -> #two\n'
            'screen "Two" #two\n'
            'screen "Three" #three\n'
        )
        self.assertEqual(
            found(source),
            [("W202", 2, 3), ("W205", 2, 3), ("W301", 2, 3), ("W302", 3, 3), ("W403", 6, 1)],
        )


class LayoutTest(unittest.TestCase):
    def test_w601_row_too_wide(self) -> None:
        source = (
            'screen "Narrow" size=300x400\n'
            "  row\n"
            '    button "Approve the request" width=200\n'
            '    button "Decline the request" width=200\n'
        )
        self.assertEqual(found(source), [("W601", 2, 3)])

    def test_w601_content_taller_than_height(self) -> None:
        source = (
            'screen "Card" phone\n  card "Profile" height=40\n    text "Ada Park"\n    text "Mei Tanaka"\n'
        )
        self.assertEqual(found(source), [("W601", 2, 3)])

    def test_w601_row_with_more_cells_than_columns(self) -> None:
        source = 'screen "Table"\n  table [Name, Role]\n    row [Ada Park, Designer, Extra]\n'
        self.assertEqual(found(source), [("W601", 3, 5)])

    def test_w602_word_clipped(self) -> None:
        source = 'screen "Clip" phone\n  row\n    text "Supercalifragilisticexpialidocious" width=60\n'
        self.assertEqual(found(source), [("W602", 3, 5)])

    def test_linked_overlays_are_laid_out(self) -> None:
        modal = '  modal "Details" #m\n    row\n      text "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW"\n'
        linked = 'screen "Home" phone #home\n  button "Open" -> #m\n' + modal
        unlinked = 'screen "Home" phone #home\n' + modal
        self.assertEqual(found(linked), [("W601", 4, 5)])
        self.assertEqual(found(unlinked), [])

    def test_no_layout_warnings_when_there_are_errors(self) -> None:
        source = (
            'screen "Clip" phone\n  row\n    text "Supercalifragilisticexpialidocious" width=60\n  buton\n'
        )
        self.assertEqual(found(source), [("E201", 4, 3)])


class ThemeTest(unittest.TestCase):
    def test_theme_block_tokens(self) -> None:
        source = 'theme "brand" extends=ink\n  color.text #1f2228\n  radius 40\n  shadow 2\nscreen "Home"\n'
        self.assertEqual(found(source), [("W505", 1, 1), ("W504", 3, 3), ("W503", 4, 3)])

    def test_unknown_theme_falls_back_to_the_default(self) -> None:
        d = validate('theme nope\nscreen "Home"\n', default_theme="blueprint")
        self.assertEqual([(x["code"], x["line"], x["column"]) for x in d], [("W502", 1, 1)])
        self.assertIn("using blueprint", d[0]["message"])

    def test_host_themes(self) -> None:
        good = {"brand": {"extends": "ink", "tokens": {"space": 3, "color.primary": "#fc0"}}}
        self.assertEqual(found('screen "Home"\n', themes=good, default_theme="brand"), [])
        loop = {"brand": {"extends": "brand2", "tokens": {"space": 9}}, "brand2": {"extends": "brand"}}
        self.assertEqual(
            found('screen "Home"\n', themes=loop, default_theme="brand"), [("E506", 1, 1), ("W504", 1, 1)]
        )


if __name__ == "__main__":
    unittest.main()
