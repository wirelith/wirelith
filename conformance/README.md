# Conformance suite

The conformance suite tests any implementation of the Wirelith specification, in any language, against reference cases. An implementation that passes every case at a version's release tag, such as `spec-v0.1`, may describe itself as compatible with that version (see [TRADEMARKS.md](../TRADEMARKS.md)). The cases on the main branch are for the current draft, and may change.

## Cases

Each folder in `cases/` is one case:

| File | What it is |
| --- | --- |
| `input.wirelith` | The source |
| `diagnostics.json` | The expected diagnostics: code, severity, line and column, in order. Written by hand from the specification. |
| `tree.json` | The expected syntax tree (section 13). Present when the source has no errors. |
| `output.svg` | The expected SVG (section 12). Present when the source renders. |
| `options.json` | Render options (section 8), when the case needs any |

The cases cover every component, every diagnostic code, every worked example in the specification and the one-page AI spec, layout edge cases, each built-in theme, theme blocks and host themes, the theme specimen, overlays and flows, and every render option.

Messages are not compared: only code, severity, line and column. Trees are compared as JSON data, so member order doesn't matter. SVGs are compared byte for byte after the normalisation in [NORMALISATION.md](NORMALISATION.md).

## Running it

The runner needs Node 22 or newer and nothing else. It talks to the implementation through commands. Each command reads a source on standard input and writes one result to standard output:

```sh
node conformance/runner/run.mjs \
  --tree "my-impl tree" \
  --diagnostics "my-impl diagnostics" \
  --svg "my-impl svg" \
  --report report.json
```

- `--tree` writes the syntax tree as JSON.
- `--diagnostics` writes the diagnostics as a JSON array.
- `--svg` writes the SVG.

Leave out any command your implementation doesn't provide: a validator, for example, can run only `--tree` and `--diagnostics`. When a case has render options, they are passed as JSON in the `WIRELITH_OPTIONS` environment variable.

`--only a,b` runs the named cases; `--cases <dir>` points at another copy of the cases. The runner exits with 0 when every check passed, and 1 when any failed, printing the first difference for each failure.

For this repository's own implementation:

```sh
pnpm build
pnpm run conformance
```

## Changing the cases

`diagnostics.json` is written by hand. `tree.json` and `output.svg` are generated from `@wirelith/core` by `node conformance/generate.mjs`, which refuses to write anything when core's diagnostics for any case differ from the hand-written ones. CI checks that the generated files are up to date. Any change to a reference output is a change to the language and needs an RFC (see [rfcs/README.md](../rfcs/README.md)).
