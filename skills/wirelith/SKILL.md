---
name: wirelith
description: Write, check and render Wirelith wireframes. Use when asked to sketch, mock up or wireframe screens, forms, layouts or flows as text, or when a markdown file contains wirelith code blocks.
---

# Wirelith

Wirelith is a plain-text language for low-fidelity wireframes. A source describes screens, what is on them, and the links between them. It renders to SVG or PNG.

## 1. Learn the language

Read the one-page spec before writing anything. Get it from whichever of these you have:

- the MCP server's `wirelith://spec/ai-spec` resource, or its `wirelith` prompt;
- `wirelith prompt` on the command line;
- the file `spec/ai-spec.md` in the Wirelith repository.

Use only what the spec describes. Wirelith has a fixed set of components, flags and attributes. There is no HTML, no styling of single elements, no images from files or URLs, and no way to add new components.

## 2. Write the source

- Put it in a fenced code block whose language is `wirelith`, or in a `.wirelith` file.
- Start with `wirelith 0.1`.
- One element per line: a component name, then its parts. Nest with exactly two spaces.
- Labels go in double quotes. Lists go in square brackets. `key=value` sets an attribute. `#id` names an element. `-> #id` links to a screen, modal or drawer, and comes last on the line.
- For another state of a screen, write a second screen with `of=#base state="…"`.
- Use made-up products and people in examples.

## 3. Check it, and fix every error

- MCP: call `validate` with the source.
- Command line: `wirelith check file.wirelith` (or a markdown file, or a folder).

Each diagnostic has a code, a line and a column, a message, and often a hint. Fix every error (codes starting with `E`), then validate again until there are none. Warnings (`W`) mean the source renders but probably not as intended; fix them too where you can.

| Code | Usually means | Fix |
| --- | --- | --- |
| `E101`, `E102` | Indentation is not two spaces per level | Re-indent with spaces |
| `E104` | A string or list is not closed | Add the closing `"` or `]` |
| `E105` | A component is outside a screen | Indent it under a `screen` |
| `E106` | A part is malformed | Read the message: often a missing value after `=`, or text that needs quotes |
| `E201` | Unknown component | Use the name the hint suggests |
| `E203` | Component in the wrong place | `modal`, `drawer`, `note`, `header` and `footer` go directly inside a screen |
| `E204` | Children under a component that takes none | Move them out, or use a container |
| `E301` | The same id twice | Rename one |
| `E401`, `E402` | A link points at nothing, or at the wrong thing | Point it at an existing screen, or a modal or drawer in the same screen |
| `W202`, `W205` | Unknown flag or attribute, or a value that isn't allowed | Use one the message lists |
| `W301` | Unknown icon | Use the icon the hint suggests |

## 4. Render it

- MCP: call `render`, with `format` `svg` or `png`.
- Command line: `wirelith render file.wirelith`, or `-o file.png` for a PNG.

An SVG or PNG made by Wirelith carries its source: `wirelith extract file.png` gets it back.

## 5. Keep it tidy

`wirelith fmt --write file.wirelith` (or the MCP `convert` tool with `to: "formatted"`) rewrites a source in canonical form, keeping its comments.
