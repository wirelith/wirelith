---
"@wirelith/core": patch
"@wirelith/mcp": patch
---

Treat names that JavaScript objects carry by default, such as `constructor`, `toString` and `__proto__`, as ordinary names everywhere: unknown components are E201 instead of a crash, attributes and theme tokens with such names are kept and reported, a host theme that isn't an object counts as empty, and such names are not entities when reading a source back from an SVG or arguments to an MCP tool.
