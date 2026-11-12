# wirelith for Python

A parser and validator for Wirelith, the plain-text language for low-fidelity wireframes, in pure Python. It is a port of the parser and validator in `@wirelith/core` (`packages/core`), and it gives the same syntax tree and the same diagnostics: the same codes, severities, lines and columns, in the same order. The messages are worded like core's but are not guaranteed to match it word for word.

It does not render. There is no SVG output.

**Status:** 0.x and unstable. The API may change in any release. The package is not published; use it from this repository.

## Requirements

Python 3.11 or newer. It uses only the standard library, has no runtime dependencies, and reads no files except its own data (font metrics and icon names, in `src/wirelith/data`).

## Usage

```python
from wirelith import parse, validate

source = '''screen "Team" #team
  header
    h2 "Team"
  list
    item "Ada Park"
    item "Mei Tanaka" icon=calender
'''

tree = parse(source)["tree"]          # the syntax tree (spec section 13)
syntax = parse(source)["diagnostics"] # the syntax errors only

for d in validate(source):            # every diagnostic (spec section 15), sorted
    print(d["code"], d["line"], d["column"], d["message"])
# W301 6 5 Line 6: there is no icon "calender". Did you mean "calendar"?
```

- `parse(source)` returns a dict with `"tree"` and `"diagnostics"`.
- `validate(source, themes=None, default_theme=None, *, screen=None)` returns a list of diagnostics. `themes` and `default_theme` are the host's themes and default theme (spec section 9.4), as in core's `themes` and `defaultTheme` options. `screen` is the render option of that name: when it is given, only that screen or overlay is laid out, as in core, so only its layout warnings are reported.
- A diagnostic is a dict with `code`, `severity` (`"error"` or `"warning"`), `line`, `column`, `message` and, when there is one, `hint`. Lines and columns count from 1; columns count Unicode code points.

Whole numbers in the tree are Python ints and other numbers are floats, so the tree reads as JSON data the same way core's does.

### Command line

```sh
PYTHONPATH=ports/python/src python3 -m wirelith tree < screen.wirelith
PYTHONPATH=ports/python/src python3 -m wirelith diagnostics < screen.wirelith
```

Each reads a source on standard input as UTF-8 and writes one JSON value on standard output: the syntax tree, or the array of diagnostics. Render options are read as JSON from the `WIRELITH_OPTIONS` environment variable; `themes`, `defaultTheme` and `screen` change the diagnostics. This is the command contract of the conformance runner (`conformance/README.md`).

## Tests

From the repository root:

```sh
python3 -m unittest discover -s ports/python/tests -t ports/python
```

The tests import the package from `ports/python/src`, so nothing needs to be installed. One of them runs every case in `conformance/cases` in-process, reading the files directly, without Node.

## Conformance suite

From the repository root, with Node 22 or newer:

```sh
PYTHONPATH=ports/python/src node conformance/runner/run.mjs \
  --tree "python3 -m wirelith tree" \
  --diagnostics "python3 -m wirelith diagnostics"
```

Every tree and diagnostics check passes. There is no `--svg` command, because this package does not render.

## Data

`src/wirelith/data` holds copies of `spec/data/fonts/*.json` and the icon names (the keys of `names` in `spec/data/icons.json`). To update the copies after the specification's data changes, or to check that they are up to date:

```sh
python3 ports/python/scripts/sync_data.py
python3 ports/python/scripts/sync_data.py --check
```

## The one known difference

Core reports `E701` when the rendered output would be wider or taller than 16,000 px on either side (spec section 16). Working that out needs the whole overview: frames placed in bands, notes and arrow lanes. This package does not build the overview, so it never reports that `E701`. Every other diagnostic `validate` gives, including the layout warnings `W601` and `W602` and the other `E701` size caps, matches core.

## How it follows core

The layout warnings depend on exact widths, so the layout code follows core's arithmetic step by step: IEEE doubles, the same order of operations, rounding to the nearest 0.5 with halves up (`floor(2x + 0.5) / 2`), text widths summed in whole font units and then scaled, and equal shares where the last share takes what is left. Where Python and JavaScript differ (number formatting, `trim`, integer checks, `Math.max` with NaN, and `sum`, which may compensate rounding in newer Pythons), the helpers in `src/wirelith/_js.py` give the JavaScript result.

## License

MIT. See `LICENSE` at the root of the repository.
