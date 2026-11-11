# RFCs

An RFC (request for comments) is how the Wirelith language changes. Use one for anything that changes what sources mean: a new or changed component, flag, attribute, rule, diagnostic, theme token, or rendering detail that moves a pixel in a conformance output.

Fixes to the tools, docs and tests don't need an RFC.

## Process

1. Open an issue with the "Language proposal" form to check the idea is worth writing up.
2. Copy `0000-template.md` to `rfcs/0000-short-name.md` and fill it in. Open a pull request.
3. The RFC stays open for comment for at least 7 days. The maintainers then accept it, ask for changes, or decline it.
4. When accepted, it gets a number and is merged. A separate pull request then implements it: it updates `spec/`, the one-page AI spec and the conformance cases together.

Before 1.0, any minor version may change or remove syntax. From 1.0, a source valid in 1.x stays valid, with the same meaning, in every later 1.y.

The specification lists things that are out of scope on purpose, such as styling individual elements, real images, custom fonts and scripts. RFCs to add them will be declined.
