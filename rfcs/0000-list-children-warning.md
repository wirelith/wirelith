# RFC 0000: Warn when a list has both entries and children

- **Status:** draft
- **Spec version:** 0.1, which is still a draft. This RFC relies on [RFC 0000-spec-releases](https://github.com/wirelith/wirelith/pull/20) (#20), under which a version is a draft until it is released.
- **Discussed in:** #25, item 2.

## Summary

A `nav` or `list` that has both a list of entries and child elements gets a new warning, `W206`, because only the list is drawn. Today the children are dropped without a word.

## Motivation

A `nav` and a `list` take their entries in one of two ways. A list is short, and `item` children can carry icons, badges and `active`. Both are natural, and the permanence review (#25) keeps both. But a source can easily end up with both, for example by adding an `item` under a nav that already has a list:

```wirelith
screen "Orders" desktop
  nav [Home, Orders]
    item "Settings"
```

Section 5.12 draws the list and ignores the children, "without a warning". "Settings" simply isn't there, and nothing says why. It's the one place where the spec silently ignores something a source wrote. Everywhere else, something ignored gets a warning: unknown flags (`W202`), out-of-range values (`W205`), extra table cells (`W601`).

## Design

**Section 5.12:** "A `nav` or `list` with both an item list and child elements draws the list and ignores the children, with `W206`."

**A new diagnostic in section 15:**

| Code | Severity | Meaning | Example message |
| --- | --- | --- | --- |
| `W206` | Warning | A `nav` or `list` has both a list of entries and child elements; only the list is drawn | Line 2: "nav" has both a list of entries and child elements; only the list is drawn |

It points at the start of the element's line, like the other diagnostics about an element (added to the list under "Positions"). One per element.

**The one-page AI spec** says "not both" next to each form.

Nothing about what is drawn changes.

### Why `W206`

`W2xx` are warnings about how components are written (`W202`, `W205`). `W203` and `W204` are free, but they would read like the unrelated errors `E203` and `E204`.

## Learnability

It's a warning, so it doesn't change validity. It tells the writer, or a model fixing its own output, exactly why an entry is missing.

## Compatibility

No source changes meaning or becomes invalid. Sources with both forms gain one warning per such element. No existing conformance case writes both, so no existing output changes. Section 14 lets warnings be added in a minor version, even after 1.0.

## Security

None.

## Alternatives

- **Draw both: the list, then the children.** It changes what such sources draw, and still gives two ways to write the same entries in one element.
- **Make it an error.** That would turn something drawable into nothing drawn, for a mistake that a warning explains.
- **Drop the list form** (#25 considered it). Then the shortest way to write a nav goes away.

## Conformance

A new case, `diagnostic-w206-list-and-children`: a `nav` and a `list`, each with both forms. That's two `W206` warnings, and the picture still draws.
