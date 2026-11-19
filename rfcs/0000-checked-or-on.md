# RFC 0000: `checked` and `on` on both checkbox and toggle

- **Status:** draft
- **Spec version:** 0.1, which is still a draft. This RFC relies on [RFC 0000-spec-releases](https://github.com/wirelith/wirelith/pull/20) (#20), under which a version is a draft until it is released.
- **Discussed in:** #25, item 1.

## Summary

`checked` and `on` both work on a `checkbox` and on a `toggle`, and mean the same: the control is set.

## Motivation

Today a `checkbox` takes `checked` and a `toggle` takes `on`. They are two names for one idea, and people use both for both controls:

```wirelith
screen "Settings" phone
  checkbox "Email me offers" on
  toggle "Bluetooth" checked
```

Each of these lines is only a warning today (`W202`), and the flag is ignored, so the picture silently shows the control unset. Someone glancing at the picture, not the diagnostics, sees the opposite of what they wrote.

From 1.0 a name can't be renamed or removed, so this is the last chance to settle it.

## Design

**Section 5.5:**

- `checkbox`: `checked` (or `on`), `disabled`
- `toggle`: `on` (or `checked`), `disabled`

**Section 5.12** adds: "On a `checkbox` or a `toggle`, `checked` and `on` mean the same. Writing both is the same as writing either."

**The one-page AI spec** keeps one name per control, and notes that the other works too.

The syntax tree keeps the flag as written. Nothing else changes.

## Learnability

Either guess now draws what the writer meant. The canonical forms stay `checkbox … checked` and `toggle … on`: the spec lists them first, and the formatter doesn't rewrite either.

## Compatibility

No source changes meaning. Sources that use the other flag lose a `W202` warning and draw the control set. No existing conformance output changes.

## Security

None.

## Alternatives

- **Rename `on` to `checked`.** It's one name for one idea, but it breaks every source that uses `toggle … on`, which is the natural way to write a toggle.
- **Keep both as they are.** The silent unset control stays.
- **A "did you mean" hint on the `W202`.** It helps someone reading diagnostics, but the picture is still wrong.

## Conformance

A new case, `component-checked-or-on`, with every combination: each flag on each control, neither, and both together with `disabled`.
