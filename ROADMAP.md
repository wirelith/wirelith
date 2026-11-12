# Road to 1.0

From 1.0, a source that is valid in 1.x stays valid, with the same meaning, in every later 1.y (spec section 14). So 1.0 is the point where the language becomes something we keep for good. Before then, any minor version may still change or remove syntax.

This page lists what has to be true before 1.0. Each item links to the issue or pull request that tracks it. A pull request that completes an item ticks it here.

## The language

- [ ] **Decide the three open rendering RFCs.** Accept, change or decline them, in this order:
  - notes below their screen (#13);
  - arrows never cross frames (#16);
  - arrow labels on lanes (#17).
- [ ] **Define when a spec version counts as released** (#19, RFC #20). Section 14 says a change that moves a pixel in a conformance output is a new minor version, but not when a version is released and stops changing. The RFC makes a version a draft until the maintainers tag it, so the open RFCs land in 0.1.
- [ ] **Decide what a note's `for=` means when it names its own screen** (#23, RFC #24). Today it's accepted silently and draws no marker on the frame, while a note without `for=` does. Either treat it like a note without `for=`, or report a diagnostic.
- [ ] **Review every component, flag and attribute for permanence** (#25). Rename or remove anything we wouldn't keep forever, while 0.x still allows it.
- [ ] **Mark the specification final** for 1.0, not draft.

## Conformance

- [x] Every diagnostic code in section 15 has a conformance case.
- [x] Every component is rendered in at least one conformance case.
- [x] Every flag is rendered in at least one conformance case (#21).
- [ ] **Have the normalisation rules in conformance/NORMALISATION.md checked against a second renderer,** so that it is the spec being tested, not one implementation.

## Implementations

- [x] `@wirelith/core` passes every conformance case.
- [x] The Python validator passes every tree and diagnostics case.
- [ ] **The Python validator reports the output-canvas size (`E701` after layout).** It is the one diagnostic it doesn't report yet.
- [ ] Wanted, not required: a renderer written independently of core that passes the whole suite.

## Checked by a person

These can't be checked by CI. They were listed as not verified when v0.1 was finished (#11).

- [ ] The rendered examples look right to a person, at 1x and 2x.
- [ ] A PNG renders identically on macOS, Linux and Windows.
- [ ] The MCP server works in a desktop MCP client: connect, read the prompt, validate, render.
- [ ] A model that has only seen the AI spec writes valid sources: the eval is run with at least two model families, and the scores are recorded.
- [ ] The font and icon attributions and license texts are complete.
- [ ] The hygiene checks really fail on a pull request with a non-noreply email, an unticked checkbox and a term the private denylist catches.
- [ ] Nothing in the repository's history, pull requests or logs breaks the ground rules in CONTRIBUTING.md.

## Releases

- [ ] **Decide when to publish the packages,** to npm and PyPI, during 0.x.
- [ ] **Write down how a release is cut:**
  - versions from changesets;
  - provenance for published packages;
  - tags for spec versions;
  - who may release.
- [ ] **Release 1.0** of the spec, the conformance suite and the reference packages together.
