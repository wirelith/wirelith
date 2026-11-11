# The Wirelith specification

| File | What it is |
| --- | --- |
| [spec.md](spec.md) | The language specification, version 0.1. This is the source of truth. |
| [ai-spec.md](ai-spec.md) | The one-page description of the language for AI agents |
| `data/fonts/*.json` | Font-metrics tables (Appendix A). Normative. |
| `data/icons.json` | The icon set (Appendix B). Normative. |
| `generators/` | The scripts that produce the data, and their pinned inputs |

## Regenerating the data

The data files are generated, never edited by hand. CI checks that they match their generators.

```sh
node spec/generators/font-metrics.mjs     # from the font files in third-party/fonts
node spec/generators/icons.mjs            # from lucide-static and generators/icons.txt
pnpm run check-spec-data                  # fails if either is out of date
```

Every input is pinned in `generators/inputs.lock.json`: the font releases and each file's SHA-256, and the icon package version and source commit. `generators/lucide-metadata.json` holds the icon categories and aliases the brand guard uses. Rebuild it with `node spec/generators/fetch-lucide-metadata.mjs`, which reads the pinned commit through the GitHub API. It is the only generator step that uses the network, and it runs only when the pinned release or the curated list changes.

## Changing the specification

A change to what sources mean needs an accepted RFC first. See [rfcs/README.md](../rfcs/README.md).
