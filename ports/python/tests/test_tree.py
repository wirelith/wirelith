# SPDX-License-Identifier: MIT

"""The syntax tree: its members, their order, and number values."""

import unittest

from wirelith import parse


class TreeTest(unittest.TestCase):
    def test_element_members_are_in_schema_order(self) -> None:
        source = (
            'screen "Team" #team\n'
            '  button "Invite Ada Park" #invite [a, b] primary width=120 -> #team "Back"\n'
            "  row\n"
            '    text "Mei Tanaka"\n'
        )
        tree = parse(source)["tree"]
        self.assertEqual(list(tree), ["type", "version", "screens"])
        screen = tree["screens"][0]
        self.assertEqual(list(screen), ["type", "id", "label", "children", "loc"])
        button = screen["children"][0]
        self.assertEqual(list(button), ["type", "id", "label", "items", "flags", "attrs", "link", "loc"])
        self.assertEqual(button["link"], {"to": "team", "label": "Back"})
        self.assertEqual(button["loc"], {"line": 2, "column": 3})
        row = screen["children"][1]
        self.assertEqual(list(row), ["type", "children", "loc"])

    def test_document_with_theme_and_flows(self) -> None:
        source = 'theme "Brand" extends=ink\n  radius 4\nscreen "A" #a\nscreen "B" #b\nflow #a -> #b "Next"\n'
        tree = parse(source)["tree"]
        self.assertEqual(list(tree), ["type", "version", "theme", "screens", "flows"])
        self.assertEqual(list(tree["theme"]), ["name", "extends", "tokens", "loc"])
        self.assertEqual(tree["theme"]["tokens"], {"radius": 4})
        self.assertEqual(
            tree["flows"], [{"from": "a", "to": "b", "label": "Next", "loc": {"line": 5, "column": 1}}]
        )

    def test_numbers_and_table_rows(self) -> None:
        tree = parse('screen "A"\n  table [Name]\n    row [Ada] width=2.0 height=1.5\n')["tree"]
        row = tree["screens"][0]["children"][0]["children"][0]
        self.assertEqual(row["type"], "table-row")
        # Whole numbers are ints, as JSON from the reference implementation would read.
        self.assertIsInstance(row["attrs"]["width"], int)
        self.assertEqual(row["attrs"], {"width": 2, "height": 1.5})

    def test_columns_count_code_points(self) -> None:
        # Each emoji is one code point (two UTF-16 units), so the second label is at column 13.
        result = parse('screen "Home"\n  text "😀😀" "x"\n')
        self.assertEqual(
            [(d["code"], d["line"], d["column"]) for d in result["diagnostics"]], [("E106", 2, 13)]
        )


if __name__ == "__main__":
    unittest.main()
