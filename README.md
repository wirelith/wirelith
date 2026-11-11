# Wirelith

Wirelith is a small plain-text language for low-fidelity wireframes: screens, layout, forms, tables, states, and click-through flows between screens. You write it in a markdown code fence, and a renderer turns it into a clean SVG.

> **Status: 0.x, unstable.** The language and the tools are being built in the open. Nothing is published to a package registry yet, and anything may change before 1.0.

```wirelith
wirelith 0.1

screen "Sign in" phone #signin
  h1 "Welcome back"
  input "Email" placeholder="you@example.com"
  input "Password" type=password
  button "Sign in" primary -> #home
  link "Forgot your password?"

screen "Home" phone #home
  h1 "Hello, Sam"
  text "You have 3 new messages."
```

## Principles

- **Learnable from one example.** Component names are the ones people guess, and there is one way to write each thing.
- **Independent.** It needs no account, no service and no particular app. The same source gives the same picture everywhere.
- **Safe to render.** A source can't load anything, run anything or add markup.
- **Deterministic.** Layout and text measurement are defined in the specification, so independent renderers agree.

## In this repository

| Path | What it is |
| --- | --- |
| `spec/` | The language specification (in progress) |
| `packages/core` | `@wirelith/core`: parser, validator and SVG renderer (in progress) |
| `rfcs/` | Proposals to change the language |

More arrives in the following pull requests: the conformance suite, a command-line tool, an MCP server, a Python validator, and guidance for AI agents.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. It explains the project's ground rules, sign-off, and how to propose a change to the language. Please also read the [Code of Conduct](CODE_OF_CONDUCT.md). To report a security problem, see [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Anyone may implement the specification, in any language, for any purpose, without permission. For use of the name, see [TRADEMARKS.md](TRADEMARKS.md).
