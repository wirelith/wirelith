# @wirelith/core

The parser, validator, layout engine and SVG renderer for Wirelith, a plain-text language for low-fidelity wireframes.

**Status: 0.x, unstable, not yet published.** It implements the [Wirelith specification](https://github.com/wirelith/wirelith/blob/main/spec/spec.md), version 0.1.

- No dependencies. No network requests. No DOM. No file access.
- Every function is pure and synchronous: the same input gives the same bytes.
- Every string from a source is escaped. The output contains only the SVG elements and attributes the specification allows.

## Usage

```js
import { render, validate } from '@wirelith/core';

const source = `screen "Sign in" phone #signin
  h1 "Welcome back"
  input "Email" placeholder="you@example.com"
  button "Sign in" primary -> #home

screen "Home" phone #home
  h1 "Hello, Sam"
`;

const { svg, diagnostics } = render(source);
// svg is a complete SVG document, or null when the source has errors.
// diagnostics: [{ code, severity, line, column, message, hint? }]
```

## API

| Function | Returns |
| --- | --- |
| `parse(source)` | `{ tree, diagnostics }`: the syntax tree and syntax errors |
| `validate(source, options?)` | Every diagnostic, sorted by line, column and code |
| `layout(source, options?)` | Frames and element boxes, with diagnostics |
| `render(source, options?)` | `{ svg, diagnostics }`; `svg` is null when there are errors |
| `outline(source, options?)` | `{ outline, diagnostics }`: screens, overlays and links |
| `extractSource(svg)` | The source embedded in an SVG, or null. Treat it as untrusted. |

Options (all optional): `themes`, `defaultTheme`, `screen`, `flows`, `notes`, `idPrefix`, `embedSource`. See section 8 of the specification.

A host should insert the SVG as a document or parsed DOM, not by concatenating it into HTML, and should set its own limits on time. See section 16 of the specification.

## License

MIT. See [LICENSE](../../LICENSE) and [NOTICE](../../NOTICE).
