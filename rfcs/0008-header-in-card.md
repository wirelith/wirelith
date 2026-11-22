# RFC 0008: A header inside a card or a column

- **Status:** accepted
- **Spec version:** 0.1, which is still a draft. This RFC relies on [RFC 0004](0004-spec-releases.md) (#20), under which a version is a draft until it is released.
- **Discussed in:** #25, and its comment on the eval results from #26.

## Summary

A `header` may also be the first child of a `card` or a `column`. There it is a bar across the top of that box, drawn like a screen's header. A card's title, if it has one, moves into the bar. Everywhere else a `header` must still be directly inside a screen.

## Motivation

Today a `header` is allowed only directly inside a `screen` (sections 5.3 and 5.11), and it always spans the whole frame, above any sidebar (section 10.3, step 8, and Appendix C.2). Anywhere else it is an error (`E203`), so nothing is drawn.

That rules out two pictures people draw often:

- **A header over one pane.** A mail or file layout often has a sidebar that runs the full height of the window, with a header across only the main pane beside it. A screen's `header` can't do this, because it sits above the sidebar.
- **A card with a title bar.** A card with its title and an action on one line, and a line under them.

```wirelith
wirelith 0.1

screen "Inbox" desktop
  row height=fill
    sidebar
      nav [Inbox, Sent, Drafts] vertical active="Inbox"
    column grow pad=lg
      header
        h2 "Inbox"
        spacer
        input placeholder="Search" type=search width=240
        button "Compose" primary
      table [From, Subject, Received]
        row [Ada Park, Quarterly plan, Today]
        row [Luis Ortega, Room booking, Yesterday]
      card "Drafts"
        header
          spacer
          button "View all" sm
        text lines=2
```

Each `header` in this source is `E203` today.

### Evidence from the learnability eval

The eval (#26, [results](../eval/results/RESULTS.md)) recorded 30 answers: two model families, sets A and B. Between them they wrote `header` 39 times.

| Where the `header` was | Times | Result |
| --- | --- | --- |
| Directly inside a `screen` | 35 | Valid |
| First child of a `column` | 4 | `E203` |
| Inside a `card`, `modal` or `drawer` | 0 | — |

All four errors came from one model family, in set A, and made three of its five set-A answers invalid (tasks A3, A4 and A5). The same model put all nine of its set-B headers directly inside the screen, and the other family never put one anywhere else.

What the writer was drawing:

- **A4 (twice) and A5.** The writer wrapped the whole screen in `column pad=md gap=md` (or `pad=lg gap=lg`) and put the header first in it. This is a screen's top bar. Moving the `header` up one level, out of the column, draws it today. The wrapper adds little: a screen's body already has padding and a `md` gap (Appendix C.2).
- **A3.** A `row` holds a `sidebar` and a `column grow`, and the header is first in the column: a header over the main pane, beside a full-height sidebar. This can't be drawn with a `header` today. The closest is a `row` followed by a `divider`.

No answer put a `header` in a card. The card half of this RFC rests on the design principle that component names are the ones people guess (section 1), not on the eval.

## Design

**Section 5.3, `header`:** "A bar at the top of a screen, or of a `card` or `column` when it is the container's first child; children in a row."

**Section 5.11, placement table:** the `header` row becomes "Directly inside a `screen`, or the first child of a `card` or a `column`". `note`, `modal`, `drawer` and `footer` keep "Directly inside a `screen`".

The limit of one `header` per screen counts only headers directly inside the screen. A screen may have its own header and also headers inside its columns and cards.

A `header` anywhere else stays `E203`. That includes a `header` that is not the first child of its card or column, and a `header` inside a `row`, `grid`, `sidebar`, `modal`, `drawer`, `tabs` or another `header`. The message SHOULD say where a header may go, for example: "Line 9: "header" must be directly inside a screen, or first inside a card or column".

**Section 10.3, step 8,** adds: "A `card` or `column` whose first child is a `header` first sets it aside at its top, across the container's full width, ignoring the container's padding. Its other children are laid out below the header as before, inside the container's padding. The container's height is the header's height plus the height it would otherwise have."

**Appendix C.2** adds a row:

| Part | Geometry |
| --- | --- |
| `header` (in a card or column) | As a screen's `header`, with these differences. Its width is the container's full width. Its left and right padding is the container's own padding (`pad`, or the default: 4u for a card, none for a column) instead of P. Inside a card, it sits inside the card's outline, and its bottom `line` runs from the outline's left edge to its right edge. |

**Appendix C.7, `card`,** adds: "When a card's first child is a `header`, the card's title, if it has one, is drawn as the header's first child (15, weight 600, line height 22), and the card draws no separate title row or the gap after it."

**Syntax tree and outline:** no change. The `header` is a child of its card or column, as written.

**The one-page AI spec:** the Regions row says where a header goes, which it doesn't today: "`header`, `footer` (directly inside a screen; a `header` may also be first inside a `card` or `column`)". The example and "Common mistakes" are unchanged.

## Learnability

**The rule was never on the page.** The one-page AI spec says where a `sidebar`, an overlay and a `note` may go, but not a `header` or a `footer`. A model that has read only that page can't know the rule, so the eval doesn't show whether the rule is hard to learn or just unstated. It does show which guess a writer makes when the page is silent: wrap the screen in a padded column, as a page container, and put the header first in it.

**What this makes valid draws what the writer meant.** In A3 it draws exactly the pane header the writer wanted. In A4 and A5 it draws a bar at the top of the wrapper column: inside the screen's padding, so slightly inset from the frame, but a top bar where the writer put it.

**A second way to write something?** Mostly not. A header in a wrapper column and a header directly in the screen draw different pictures (an inset bar, and a bar the width of the frame), so they are two pictures, not two spellings of one. The exception is a card: `card "Orders"` with a `header`, and an untitled `card` whose header starts with `h3 "Orders"`, draw almost the same thing. The AI spec shows only the first.

**Why the first child only.** "A bar at the top" is the guess this RFC makes valid. A header in the middle of a column would be a row with a line under it, which a `row` and a `divider` already draw.

## Compatibility

No valid source changes meaning. Sources with a `header` first in a card or a column were invalid (`E203`) and become valid. No existing conformance output changes, and no case expects `E203` for a header in a card or column today. No upgrade is needed.

Allowing more is additive, so this change could also land in any later minor version, including after 1.0.

## Security

None. The header is drawn with the same elements as a screen's header (a `line` and text), which are already allowed. No new size limit is needed.

## Alternatives

- **Do nothing to the language; state the rule on the one page.** Add "`header` and `footer` go directly inside a screen" to the AI spec's Regions row and to "Common mistakes", and make the `E203` message say "move it up, directly inside the screen". This needs no RFC, fixes A4 and A5 for any writer who reads the page, and can be measured by running the eval again. It leaves A3's pane header impossible to draw with a `header`, and the card unanswered. Because this RFC only allows more, doing this first doesn't close the door on it.
- **Card only,** as listed in #25 under "Can wait until after 1.0". It answers the card question but fixes none of the four errors the eval found.
- **Column only.** Fixes all four errors and leaves cards as they are.
- **Treat a header first in a screen's only top-level column as the screen's header.** It would draw A4 and A5 exactly like a screen header, but the meaning would depend on how deeply the header is nested, which is harder to explain than either rule. It doesn't help A3.
- **A header anywhere in a card or column.** Covers more guesses, but a header in the middle of a box isn't a bar at the top, and `row` plus `divider` already draws it.
- **Also `modal` and `drawer`.** Both already draw a title bar. No writer tried it.
- **Also `footer`, as the last child.** It would mirror this rule. No writer in the eval tried it, so it is left for a separate RFC, or for this one if reviewers prefer the symmetry.
- **Keep a card's title above its header,** instead of moving it into the bar. It draws two stacked rows at the top of the card, which isn't what a card with a title bar looks like.

## Conformance

New cases:

- `component-header-in-column`: a header over the main pane beside a full-height `sidebar` in a `row`, and a header in a column with `pad=lg`.
- `component-header-in-card`: a card with a title and a header, and an untitled card with a header.
- `diagnostic-e203-header-not-first`: a header as the second child of a column, and of a card.
- `diagnostic-e203-header-in-row`: a header inside a `row`, a `modal` and a `sidebar`.

No existing case changes.
