# @wirelith/mcp

A local [Model Context Protocol](https://modelcontextprotocol.io) server for Wirelith. It lets any MCP client or AI agent learn the language, check sources, and draw them.

**Status: 0.x, unstable, not yet published.**

It runs on your machine over standard input and output. It opens no network connection, sends no telemetry, and reads no files: every tool works on the text it is given.

## What it offers

| Kind | Name | What it does |
| --- | --- | --- |
| Tool | `validate` | Checks a source. Returns its diagnostics with line numbers, as text and as structured data. |
| Tool | `render` | Renders a source to SVG (as text) or PNG (as an image). Options: `format`, `scale`, `screen`, `theme`, `notes`, `flows`, `embedSource`. |
| Tool | `convert` | Converts a source to its `outline`, its `formatted` canonical form, or its syntax `tree`. |
| Resource | `wirelith://spec/ai-spec` | The whole language on one page |
| Prompt | `wirelith` | The same page, followed by an optional `task` |

An agent that reads the resource or the prompt when it connects can write valid sources straight away, and `validate` tells it exactly what to fix.

## Setting it up

Any MCP client that can start a local server over stdio can use it. The configuration has the same shape in most clients:

```json
{
  "mcpServers": {
    "wirelith": {
      "command": "wirelith-mcp"
    }
  }
}
```

`wirelith-mcp` is the command this package installs. Until it is published, build it from this repository and point the client at `node packages/mcp/dist/bin.js`.

## License

MIT. See [LICENSE](../../LICENSE) and [NOTICE](../../NOTICE).
