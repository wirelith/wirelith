# @wirelith/cli

The `wirelith` command: renders Wirelith sources to SVG and PNG, and checks, formats and extracts them.

**Status: 0.x, unstable, not yet published.**

```sh
wirelith render flows.md                 # every wirelith fence in a markdown file, as SVG
wirelith render screen.wirelith -o screen.png --scale 2
wirelith render designs/ -o out/         # a whole folder
wirelith check designs/                  # diagnostics by line; exits 1 on errors
wirelith fmt --write designs/            # canonical form, keeping comments
wirelith extract screen.png              # the source embedded in an SVG or PNG
wirelith prompt                          # the one-page description of Wirelith for AI agents
```

Run `wirelith --help` for every option, including `--theme`, `--screen` and `--watch`.

Exit codes: 0 when everything worked; 1 when a source has errors, or `fmt --check` found a file to change; 2 for a usage error; 3 when a file can't be read or written.

PNGs are drawn with the bundled fonts, so they look the same on every machine, and they carry their source. Nothing is sent anywhere: the tool works offline.

MIT licensed. See [LICENSE](../../LICENSE) and [NOTICE](../../NOTICE).
