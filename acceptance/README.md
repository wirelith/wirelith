# Independence acceptance test

[`run.mjs`](run.mjs) checks that Wirelith works with no account, no service and no network. CI (the `acceptance` job in [ci.yml](../.github/workflows/ci.yml)) packs the packages and the Python validator, installs them in a fresh container, then runs the container again with networking switched off and checks that:

1. one CLI command turns a markdown file containing two `wirelith` fences into two PNGs, each carrying its source;
2. the MCP server starts over stdio, and a scripted client reads the spec resource, validates and renders through it;
3. the Python validator gives the same diagnostics as core for the same sources;
4. the built packages contain no URL except the SVG namespace, no reference to a host application's globals, no networking import, and, in core, no import at all except its own files.

It also renders [the README's picture](../docs/readme-example.wirelith) and fails unless it matches [the committed PNG](../docs/readme-example.png) byte for byte.

To run it yourself, install the packed packages and the Python package into a folder, then:

```sh
PYTHONPATH=<folder>/pylib node acceptance/run.mjs <folder> .
```

The first check fails unless the network really is unreachable.
