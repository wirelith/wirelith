# Wirelith Language Specification, v0.1 (draft)

**Status:** draft, unstable. Anything may change before 1.0.

Wirelith is a small plain-text language for low-fidelity wireframes. A source describes one or more screens and the links between them. A renderer turns it into SVG.

This document is written so that someone can build a conforming parser and renderer without reading any existing implementation. The words MUST, SHOULD and MAY are used as in RFC 2119.

**License.** This specification is licensed under the MIT License. Anyone may implement it, in any language, for any purpose, without permission.

**What is normative.** The text of this document, its appendices, and the data files it names (`spec/data/fonts/*.json` and `spec/data/icons.json`) are normative. The conformance suite tests an implementation against them. Where a conformance output and this document disagree, this document is right and the output is a bug.

## 1. Design principles

1. **Learnable from one example.** A person or a language model that has seen a single example must be able to write a new, valid screen. Component names are the ones people guess. There is one way to write each thing.
2. **Host-independent.** The language needs no particular app, account, service or network. The same source gives the same output in a browser, on a server and from a command line.
3. **Closed vocabulary.** A fixed set of components is drawn as fixed shapes. There is no HTML, no script, no styling language and no way to load a file or URL.
4. **Low fidelity on purpose.** A wireframe shows structure, content and flow. It cannot be made to look like a finished product or a real sign-in page.
5. **Deterministic.** Layout and text measurement are defined here, so two independent renderers agree.
6. **Plain text first.** A source reads well unrendered, diffs cleanly, and survives copy and paste.

## 2. A first example

````markdown
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
````

In markdown, a source lives in a fenced code block whose language is `wirelith`. A standalone file uses the extension `.wirelith` and the media type `text/x-wirelith`.

## 3. Lexical rules

- **Encoding.** UTF-8. Line endings are LF or CRLF; a lone CR also ends a line. A byte-order mark is ignored. A library that accepts a string instead of bytes replaces any lone surrogate with U+FFFD before parsing.
- **Characters that are not allowed.** A control character (U+0000 to U+001F other than LF and CR, and U+007F) anywhere in a source is an error (`E106`), except a tab in indentation, which is `E102`. So are U+FFFE and U+FFFF. None of these can appear in an XML document, so rejecting them keeps every source safe to render.
- **Spaces.** Only U+0020 separates parts. Trailing spaces on a line are ignored.
- **Indentation.** Exactly two spaces per level. A tab in indentation is an error (`E102`). A line indented by an odd number of spaces, or more than one level deeper than its parent, is an error (`E101`). Blank lines and comment lines do not count when working out a line's parent.
- **Blank lines** are ignored.
- **Comments** start with `//` and run to the end of the line. A comment is a whole line, or follows an element after at least one space. `//` inside a string or a list is text.
- **Strings** are in double quotes: `"Sign in"`. Escapes are `\"`, `\\` and `\n`. Any other escape, such as `\t`, is an error (`E106`). A string cannot span lines; a string with no closing quote is `E104`. Where a component draws a single line of text, a `\n` in its label is drawn as a space.
- **Bare words** are made of the ASCII letters `A` to `Z` and `a` to `z`, the digits `0` to `9`, and `-`, `_`, `.`, `:`, `%` and `/`. They are used for names, flags and simple values. Any other text, including letters outside ASCII, goes in double quotes.
- **Numbers.** A bare word that matches `-?[0-9]+(\.[0-9]+)?` is a number. Anything else, such as `50%`, `16:6` or `390x844`, is a string.
- **Lists** are in square brackets, with items separated by commas: `[Home, Projects, "Help, docs"]`. An item is a string, or bare text: any characters other than `,`, `[`, `]`, `"` and a line break, with spaces trimmed from both ends and kept as written inside. Bare text may start with `#`. `[]` is an empty list. An empty item (`[a,,b]`), or anything other than spaces between a quoted item and the next comma or bracket (`["a" b]`), is an error (`E106`). A list with no closing bracket is `E104`.
- **Ids** start with `#`, then a letter, then letters, digits, `-` or `_`: `#home`.
- Component names, flags and attribute keys are lowercase and case-sensitive. `Button` is an unknown component (`E201`), whose message suggests `button`.

## 4. Grammar

Every line is one element: a component name followed by its parts, in any order.

```text
button "Save" primary disabled width=120 #save -> #done "On success"
│      │      │                │         │     └ link, with an optional label
│      │      │                │         └ id
│      │      │                └ attribute
│      │      └ flags
│      └ label
└ component
```

- The **first string** on a line is the element's label. A second string, other than a link's label, is an error (`E106`).
- The **first list** on a line is the element's items. A second list, other than an attribute's value, is an error (`E106`).
- A **flag** is a bare word that switches something on.
- An **attribute** is `key=value`. The value is a bare word, a string, a list or an id. `key=` with nothing after it is an error (`E106`).
- An **id** names the element so links and notes can point at it. Ids are unique in a source.
- A **link** is `->`, then a target id, then an optional label. It comes last on the line. Anything after it other than a comment is an error (`E106`).
- Every label is optional. A component with no label draws no text where its label would be.

Children are the lines indented one level below an element.

### 4.1 PEG sketch

```text
document    <- header? (blank / comment / theme / themeBlock / flow / screen)*
header      <- "wirelith" SP version EOL
theme       <- "theme" SP bare EOL
themeBlock  <- "theme" SP string (SP "extends=" bare)? EOL (INDENT token SP tokenValue EOL)*
screen      <- "screen" parts EOL children
flow        <- "flow" SP id SP "->" SP id (SP string)? EOL
element     <- name parts link? trailing? EOL children
children    <- (INDENT(+1) element)*
parts       <- (SP part)*
part        <- string / list / attr / id / flag
attr        <- key "=" (string / list / id / bare)
link        <- SP "->" SP id (SP string)?
list        <- "[" (item ("," item)*)? "]"
item        <- string / bareText
string      <- '"' (escape / [^"\\\n])* '"'
id          <- "#" [A-Za-z] [A-Za-z0-9_-]*
version     <- [0-9]+ "." [0-9]+
trailing    <- SP "//" [^\n]*
```

`name`, `key`, `flag`, `bare` and `token` are bare words. `INDENT(+1)` is two more spaces than the parent line. `tokenValue` is the rest of the line after the token and a space, without any trailing comment, with spaces trimmed from both ends. It is read according to the token's type (section 9.2), so a colour such as `#abcdef` is never read as an id.

### 4.2 Document structure

- The optional line `wirelith 0.1` declares the spec version the source targets (section 14). It must be the first line that is not blank and not a comment. Anywhere else it is `E105`.
- `theme` lines and blocks select or define a theme (section 9).
- `screen` elements hold everything that is drawn.
- `flow` lines add links between screens (section 7).
- Only `screen`, `theme` and `flow` may appear at the top level, in any order.
- A source with no screens is valid. It renders the theme specimen of its theme (section 9.6). That includes a source that holds only a `theme` line or block, and an empty source, which shows the specimen of `defaultTheme`.

## 5. Components

v0.1 defines the components below. Any other name is an error (`E201`), and the message SHOULD suggest the closest valid name.

**Label** is what the first string means. **Items** is what the first list means. A dash means it isn't used.

### 5.1 Screens

| Component | Label | Flags and attributes | Notes |
| --- | --- | --- | --- |
| `screen` | Title | `phone` (390×844), `tablet` (820×1180), `desktop` (1280×800, the default), or `size=WxH`; `of=#id` and `state="…"` (section 7.3) | Children are laid out as a column. A screen taller than its device grows downward. |

### 5.2 Layout

| Component | Label | Flags and attributes | Notes |
| --- | --- | --- | --- |
| `row` | — | `gap`, `pad`, `align`, `justify`, `wrap` | Children left to right |
| `column` | — | `gap`, `pad`, `align`, `justify` | Children top to bottom |
| `grid` | — | `cols=N` (1 to 12), `gap`, `pad` | Children fill equal-width cells, row by row. A child MAY set `span=N`. |
| `spacer` | — | `size` | Empty space. In a row or column with no `size`, it takes all remaining room. |
| `divider` | — | — | A thin line: horizontal in a column, vertical in a row |

### 5.3 Regions

| Component | Label | Items | Flags and attributes | Notes |
| --- | --- | --- | --- | --- |
| `header` | — | — | `gap`, `pad`, `align`, `justify` | A bar at the top of a screen; children in a row |
| `footer` | — | — | `gap`, `pad`, `align`, `justify` | A bar at the bottom of a screen; children in a row |
| `sidebar` | — | — | `right`, `width` | A column of navigation or supporting content, 240 px wide by default. Directly inside a `screen` it is full height, at most one on each side. Inside a `row` it is a fixed-width column beside the row's other children. Anywhere else is an error (`E203`). |
| `nav` | — | Entries | `active="…"`, `vertical` | A list overrides children. Children are `item` elements. |
| `tabs` | — | Tab names | `active="…"` | Children, if any, are the content of the active tab |
| `breadcrumbs` | — | Path | — | The last entry is the current page |

### 5.4 Text

| Component | Label | Flags and attributes |
| --- | --- | --- |
| `h1`, `h2`, `h3` | Heading text | `align` |
| `text` | Paragraph text; wraps to the container | `muted`, `align`, `lines=N` (draw N placeholder lines when there's no label) |
| `label` | A short caption | `muted` |

### 5.5 Controls

| Component | Label | Items | Flags and attributes |
| --- | --- | --- | --- |
| `button` | Button text | — | `primary`, `secondary` (default), `danger`, `disabled`, `icon=name`, `sm`, `lg`. With an icon and no label it is a square icon button. |
| `link` | Link text | — | `disabled` |
| `input` | Field label | — | `placeholder`, `value`, `type` (`text`, `password`, `email`, `number`, `search`, `date`), `required`, `disabled`, `error="…"` |
| `textarea` | Field label | — | `placeholder`, `value`, `rows=N` |
| `select` | Field label | Options | `value`, `placeholder`, `disabled` |
| `checkbox` | Option text | — | `checked`, `disabled` |
| `radio` | Group label | Options | `value`, `disabled` |
| `toggle` | Option text | — | `on`, `disabled` |

### 5.6 Content

| Component | Label | Items | Flags and attributes | Notes |
| --- | --- | --- | --- | --- |
| `table` | Caption | Column names | `rows=N` | Children are `row` elements. With no children, `rows=N` draws N placeholder rows; with children, `rows` is ignored. |
| `row` (directly inside `table`) | — | Cell values | `selected` | Under a `table`, `row` is a table row, not a layout row. A row with fewer cells than the table has columns gets empty cells. Extra cells are not drawn, with `W601`. |
| `list` | — | Entries | `ordered` | A list overrides children. Children are `item` elements. |
| `item` | Item text | — | `icon=name`, `active`, `badge="…"` | Used inside `list` and `nav` |
| `card` | Title | — | `pad`, `gap` | A bordered box; children in a column |
| `image` | Description | — | `width`, `height`, `ratio=W:H` | A crossed box with the description. Never loads a picture. |
| `icon` | Icon name | — | `sm`, `lg` | Section 5.9 |
| `badge` | Badge text | — | `primary`, `danger`, `success` |
| `avatar` | A person's name | — | `sm`, `lg` | A circle with up to two initials: the first character of the first word and, when there are two or more words, the first character of the last word. Words are separated by spaces, a character is a Unicode code point, and only `a` to `z` are changed to capitals. |

### 5.7 Overlays

| Component | Label | Flags and attributes | Notes |
| --- | --- | --- | --- |
| `modal` | Title | `open`, `width` | A centred dialog over a dimmed screen |
| `drawer` | Title | `open`, `right` (default), `left`, `bottom`, `width` | A panel that slides over the screen from one edge |

An overlay is a direct child of a `screen`. It is drawn only when it has the `open` flag, or when it is the target of a link (section 7.2). An overlay that is neither open nor linked to is still valid; it is listed in the outline (section 13.2) but not drawn.

### 5.8 State placeholders

| Component | Label | Notes |
| --- | --- | --- |
| `empty` | Message | An icon and message for "nothing here yet". Children (usually a button) are drawn below. |
| `loading` | Message, optional | A spinner mark and message |
| `error` | Message | A warning mark and message. Children (usually a retry button) are drawn below. |

### 5.9 Icons

Icon names come from a fixed set bundled with the spec version: a pinned subset of the Lucide icon set (ISC license), listed in Appendix B. The set contains no brand or product logos, and none may be added.

An icon name is used by `icon "name"`, `button icon=name` and `item icon=name`. An unknown icon name in any of these is a warning (`W301`). The renderer draws a plain square in its place.

### 5.10 Common attributes

| Attribute | Values | Applies to |
| --- | --- | --- |
| `gap` | `none`, `xs`, `sm`, `md` (default), `lg`, `xl` | Containers |
| `pad` | The same scale; the default depends on the component | Containers |
| `align` | `start`, `center`, `end`, `stretch` (cross axis) | Containers and text |
| `justify` | `start`, `center`, `end`, `between` (main axis) | Containers |
| `width`, `height` | A number of pixels, a percentage such as `50%`, or `fill` | Any element |
| `grow` | Flag: take the remaining room on the main axis | Any element in a row or column |
| `span` | 1 to 12 | A child of `grid` |

A flag or attribute that a component doesn't define is a warning (`W202`) and is ignored. So is a flag given a value (`primary=yes`) and an attribute written as a bare flag (`placeholder`).

**Values outside the allowed set** are a warning (`W205`), and the element is drawn as if the attribute were not there:

| Attribute | Allowed | When missing or not allowed |
| --- | --- | --- |
| `gap`, `pad` | `none`, `xs`, `sm`, `md`, `lg`, `xl` | The component's default (Appendix C) |
| `align`, `justify` | As above | The container's default (section 10.3) |
| `width`, `height` | A number from 0 to 16,000, a percentage from 0% to 100%, or `fill` | The intrinsic size |
| `type` on `input` | `text`, `password`, `email`, `number`, `search`, `date` | `text` |
| `cols` on `grid` | A whole number from 1 to 12 | 2 |
| `span` | A whole number from 1 to 12 | 1. A span larger than `cols` is treated as `cols`. |
| `rows`, `lines` | A whole number from 1 to 100 | The component's default |
| `size` on `spacer` | A size word, or a number of pixels from 0 to 16,000 | Takes the remaining room |
| `size` on `screen` | `WxH`, each a whole number from 1 to 16,000 | The device size |
| `ratio` on `image` | `W:H`, each a number greater than 0 | 4:3 |

### 5.11 Children and placement

These components take children: `screen`, `row`, `column`, `grid`, `header`, `footer`, `sidebar`, `card`, `tabs`, `nav`, `list`, `table`, `modal`, `drawer`, `empty` and `error`. Every other component is a leaf, and children under a leaf are an error (`E204`).

Some components may appear only in certain places. Anywhere else is an error (`E203`):

| Component | Allowed only |
| --- | --- |
| `item` | Directly inside `list` or `nav` |
| `row` with cell values, as a table row | Directly inside `table`. A `table` takes no other children. |
| `note`, `modal`, `drawer`, `header`, `footer` | Directly inside a `screen` |
| `sidebar` | Directly inside a `screen`, or directly inside a `row` |

A screen has at most one `header`, one `footer`, one left `sidebar` and one right `sidebar`. A second one is `E203`.

### 5.12 When parts disagree

- A `text` with a label ignores `lines`.
- A `tabs` with no `active` shows its first tab as active. A `nav` with no `active` shows nothing as active.
- A `nav` or `list` with both an item list and child elements draws the list and ignores the children, without a warning.
- An `item` inside a `nav` with `active` is active, whatever the nav's `active` says.

## 6. Notes (numbered annotations)

A `note` explains something about an element without being part of the design.

```wirelith
screen "Checkout" #checkout
  button "Place order" primary #place
  note "Disabled until the address is valid" for=#place
  note "This screen is shown after the cart"
```

- A `note` is a child of a `screen`. Its label is the note text.
- `for=#id` points the note at an element in the same screen. Without `for`, the note is about the whole screen. An id that doesn't exist is `E401`; an element in another screen is `E402`.
- Notes are numbered from 1 in source order, per screen.
- The renderer draws a numbered marker at the top-right corner of the target (the screen frame's corner for a note without `for`), and a numbered list of the notes below the screen. Notes never change the layout inside the screen. A note about an element that isn't drawn, such as one inside an overlay that is never shown, is listed but has no marker.
- A host MAY hide notes (section 8).

## 7. Flows

### 7.1 Links

Any element may end with a link: `->`, a target id, and an optional label.

```wirelith
button "Sign in" primary -> #home
item "Settings" -> #settings "Opens settings"
```

The target is a `screen`, a `modal` or a `drawer`. A link to an unknown id, or to an element of any other kind, is an error (`E401`). The same applies to every reference in a source: a `flow` must name two screens, `of=` must name a screen that is not itself a variant, and `for=` must name an element.

A `flow` line at the top level links two screens directly, for a transition that no single element causes:

```wirelith
flow #signup -> #welcome "After email is confirmed"
```

### 7.2 Overlays as targets

A link to a `modal` or `drawer` means "this opens it". The overlay must be in the same screen as the link, or the link is an error (`E402`).

### 7.3 States and variants

A screen can be a variant of another: the same screen in a different state.

```wirelith
screen "Projects" #projects
  table [Name, Owner, Updated] rows=5

screen "Projects" #projects-empty of=#projects state="Empty"
  empty "No projects yet"
    button "New project" primary
```

- `of=#id` names the base screen. `state` is a short name for the variant.
- The base screen may not itself be a variant (`E401`): variants are one level deep.
- A variant uses the base screen's device size unless it sets its own.
- A variant is a complete screen. Nothing is inherited from the base except the size.
- Links may target a variant like any other screen.

### 7.4 How a renderer shows flows

A renderer has two modes.

**Static (the default, and the only mode a conforming renderer MUST support).** The output is one SVG, the *overview*:

1. Screens are placed left to right in source order, tops aligned, 96 px apart. Each has its title above it.
2. A variant is placed directly below its base screen, 64 px apart, with its `state` name after the title, as `Title (State)`.
3. An overlay that is the target of a link and does not have `open` is drawn as an extra frame after its screen: the screen, dimmed, with the overlay open.
4. Each link is an arrow from the right edge of its source element to the nearest edge of its target frame, with its label at the midpoint. Arrows are routed around frames with horizontal and vertical segments only (section 10.6).
5. A source with one screen and no links is drawn as that screen alone.

In detail:

- **Groups.** Each screen that is not a variant starts a group. A group's first row is the screen, followed by the extra frames of its linked overlays, in source order. Each of its variants adds a row below, in source order, made of the variant and the extra frames of its own linked overlays. Rows are 64 px apart. The frames of a group are aligned in columns: the first frame of every row is in the first column, the second in the second, and so on. Each column is as wide as its widest frame, every frame starts at its column's left edge, and columns are 96 px apart. A group is as wide as its columns. Groups are placed left to right, 96 px apart.
- **Bands.** Groups are placed in bands. A group that would make the overview wider than 16,000 px (section 16), counting the 32 px margin on each side, starts a new band, below the tallest group of the band before, 96 px further down. The first group of a band is never moved to a new band, so a single group wider than the canvas is still `E701`.
- **Notes.** A frame with notes has its notes list 24 px below it, as wide as the frame or 240 px, whichever is wider. The list counts as part of the frame for spacing. It is below the frame, not beside it, so that no arrow crosses it: arrows run only beside frames and above bands.
- **Canvas.** The overview has a 32 px margin on every side. Each frame's title is one line, set 8 px above the frame (Appendix C.9).
- **One screen alone.** A source with one screen, no links and no linked overlays is drawn as that frame and its notes list, with no title line and no margin.
- **Where an arrow starts.** A link on an element inside an overlay starts from the overlay's frame. A `flow` arrow starts from the middle of its source frame's edge. A link to an overlay that has `open` points at its own screen's frame; it is not drawn.
- **Options.** With `flows` off, arrows are not drawn, but overlay frames still are. With `notes` off, neither markers nor lists are drawn, and frames close up as if no notes existed.
- **Errors.** A renderer given a source with errors returns its diagnostics and no SVG. How a host shows the diagnostics is up to the host.

**Interactive (optional).** One screen is shown at a time. Activating an element that has a link shows its target. A host that offers this MUST also offer the static overview, and MUST NOT run anything from the source: a link can only show another frame of the same source. The 0.1 reference renderer does not implement interactive mode and never emits `a` elements.

## 8. Render options

A renderer takes a source and a set of options from its host. The option names below are the conceptual interface. A library may spell them to fit its language.

| Option | Meaning | Default |
| --- | --- | --- |
| `themes` | A map from theme name to theme tokens, supplied by the host (section 9.4) | None |
| `defaultTheme` | The theme used when the source names none | `paper` |
| `screen` | Draw only the screen with this id, as one screen alone (section 7.4), without arrows. The id may also be a `modal` or `drawer`: then its screen is drawn, dimmed, with that overlay open. An id that is none of these is an error the host made, not a source error; a library reports it in the way usual for its language. | All screens |
| `flows` | Draw link arrows in the overview | On |
| `notes` | Draw notes | On |
| `idPrefix` | A prefix for every id in the SVG, so several outputs can share a page. It must match `[A-Za-z][A-Za-z0-9_-]*`; anything else is a host error. | `wl` |
| `embedSource` | Embed the source in the output (section 12.3) | On |

A source cannot set render options, apart from choosing a theme by name.

## 9. Themes

A theme is a named set of tokens. Tokens change colours, type, corner radius and spacing. They cannot add shapes, images or text.

### 9.1 Built-in themes

| Name | Description |
| --- | --- |
| `paper` | Light, neutral grey. The default. |
| `ink` | Dark |
| `blueprint` | Blue on white, one colour |

### 9.2 Tokens

| Token | Value | Limits | `paper` | `ink` | `blueprint` |
| --- | --- | --- | --- | --- | --- |
| `color.bg` | Colour | | `#f4f5f7` | `#16181c` | `#f2f6fc` |
| `color.surface` | Colour | | `#ffffff` | `#1f2228` | `#ffffff` |
| `color.border` | Colour | | `#9aa1ab` | `#5a6270` | `#3f6fc0` |
| `color.text` | Colour | | `#22262b` | `#e6e8eb` | `#1d4a96` |
| `color.muted` | Colour | | `#6b7280` | `#9aa2ae` | `#4f74b8` |
| `color.primary` | Colour | | `#2c3138` | `#e6e8eb` | `#1d4a96` |
| `color.on-primary` | Colour | | `#ffffff` | `#16181c` | `#ffffff` |
| `color.danger` | Colour | | `#b42318` | `#f2705f` | `#1d4a96` |
| `color.success` | Colour | | `#1a7f4b` | `#4cc38a` | `#1d4a96` |
| `font.body` | Font name | From the allowlist | `sans` | `sans` | `sans` |
| `font.heading` | Font name | From the allowlist | `sans` | `sans` | `sans` |
| `radius` | Pixels | A whole number, 0 to 16 | `6` | `6` | `2` |
| `space` | Pixels: the base spacing unit | A whole number, 2 to 8 | `4` | `4` | `4` |
| `stroke` | Pixels: line thickness | 1 to 3, in steps of 0.5 | `1.5` | `1.5` | `1.5` |

`blueprint` uses one colour on purpose, so its `danger` and `success` are the same blue as its text.

**Colours** are `#rgb` or `#rrggbb`. No names, functions, gradients or transparency.

**Colours** are matched without regard to letter case, and are written in the output in lowercase `#rrggbb` form (`#abc` becomes `#aabbcc`).

**Fonts** come from a fixed allowlist whose metrics ship with the spec (Appendix A): `sans` (Inter), `serif` (Source Serif 4) and `mono` (JetBrains Mono). A theme cannot name any other font or load a font file.

### 9.3 Themes in the source

A `theme` line selects a theme by name:

```wirelith
theme blueprint
```

A `theme` block defines one in the source and selects it:

```wirelith
theme "fernway" extends=paper
  color.primary #1f6f5c
  color.on-primary #ffffff
  radius 10
  font.heading serif
```

- A block sets only the tokens it lists. The rest come from `extends`, or from `paper`.
- A block may list no tokens at all; it then names a copy of the theme it extends.
- A source has at most one `theme` line or block, anywhere at the top level. A second is an error (`E501`).

### 9.4 Themes from the host

A host MAY pass named themes in the `themes` option. Each is a map from token name to value, with an optional `extends`. This is how an app applies its own or its customers' design standards without changing any source. In JSON:

```json
{
  "fernway": { "extends": "paper", "tokens": { "color.primary": "#1f6f5c", "radius": 10 } }
}
```

A token value may be a string or a number. Numbers may also be given as strings.

A theme name is resolved in this order:

1. a `theme` block in the source
2. the host's `themes` option
3. the built-in themes

If the name isn't found, the renderer uses `defaultTheme` and reports `W502`. If the source names no theme, the renderer uses `defaultTheme`.

### 9.5 Validation

Host themes and source themes are validated the same way, and neither is trusted.

- An unknown token is ignored, with `W503`.
- A value of the wrong type, or outside its limits, is ignored, with `W504`. The inherited value is used.
- If the contrast between `color.text` and `color.surface`, or between `color.on-primary` and `color.primary`, is below 3:1, the renderer reports `W505` and still draws. Contrast is the WCAG 2 contrast ratio: (L1 + 0.05) ÷ (L2 + 0.05), where L1 and L2 are the relative luminances of the lighter and darker colour, and relative luminance is 0.2126 R + 0.7152 G + 0.0722 B, with each channel c (0 to 1) linearised as c ÷ 12.92 when c ≤ 0.04045, and ((c + 0.055) ÷ 1.055)^2.4 otherwise. Messages show the ratio to one decimal place.
- `extends` chains are at most 4 deep and may not loop (`E506`). An `extends` that names a theme that doesn't exist is treated as `paper`, with `W502`.

### 9.6 Theme specimen

A source with no screens renders a specimen of its theme: one frame, titled `Theme: <name>`, that shows what the theme looks like. It is laid out and drawn like a `desktop` screen whose content is:

1. **Colours.** A block of nine swatches, one per colour token in the order of section 9.2, in a grid of three columns. Each swatch is a filled rectangle with its token name and its value beside it (Appendix C.10).
2. **Type and components.** The elements of this fixed source, in order, drawn with the theme:

```wirelith
screen "Specimen"
  h1 "Heading one"
  h2 "Heading two"
  h3 "Heading three"
  text "Body text. The quick brown fox jumps over the lazy dog."
  label "Label text"
  row
    button "Primary" primary
    button "Secondary"
    button "Danger" danger
  input "Input" placeholder="Placeholder"
  row
    checkbox "Checkbox" checked
    toggle "Toggle" on
  row
    badge "Default"
    badge "Primary" primary
    badge "Success" success
    badge "Danger" danger
  card "Card"
    text "Card content"
```

The specimen has no links and no notes, so it is drawn as one screen alone (section 7.4), with its title in the SVG's `title`. Its diagnostics are those of the theme alone.

## 10. Layout

Layout is a small box model, defined here in full so that it can be built in any language. It is a strict subset of flexbox behaviour.

### 10.1 Units and rounding

- All lengths are in CSS pixels at 1×.
- One **unit** (`u`) is the theme's `space` token.
- The spacing scale is `none` = 0, `xs` = 1u, `sm` = 2u, `md` = 4u, `lg` = 6u, `xl` = 8u.
- Every computed position and size is rounded to the nearest 0.5 px, halves rounding up, when it is computed and before it is used by anything else. Exactly: round(x) = floor(2x + 0.5) ÷ 2, in IEEE 754 double precision.
- Text widths are summed in whole font units first, and scaled to pixels once (section 11), so that every implementation gets the same result.
- When room is shared equally among several children, each share is round(room ÷ n), except the last, which takes what is left. Shares are given in source order.

### 10.2 Boxes

Every element is a box with a width, a height, and padding. Containers also have a gap and a main axis: horizontal for `row`, `header`, `footer` and horizontal `nav`; vertical for everything else.

### 10.3 The algorithm

Layout runs top-down for widths, then bottom-up for heights.

1. **A screen's content width** is its device width minus its padding (4u on `phone`, 6u otherwise).
2. **In a vertical container,** each child's width is the container's content width, unless the child sets `width`, or the container's `align` is not `stretch`, in which case the child takes its intrinsic width (10.4).
3. **In a horizontal container:**
   1. Children with a fixed or percentage `width` take it. Percentages are of the container's content width.
   2. Other children without `grow` take their intrinsic width.
   3. The room left, after gaps, is shared equally among children with `grow`, `width=fill`, and `spacer` elements with no `size`.
   4. If there is no room left and the children overflow, every child without a fixed width is scaled down by the same factor, to no less than its minimum width (10.4). This is repeated: a child that reaches its minimum keeps it, and the factor is worked out again for the others, until everything fits or every such child is at its minimum. Any remaining overflow is clipped at the container, with `W601`.
   5. Text that ends up narrower than its one-line width wraps (section 11), and its height grows with the number of lines.
   6. **`wrap`.** A `row` with the `wrap` flag first splits its children into lines: children are taken in order, at their fixed or intrinsic width, and a child that would make the line wider than the content width starts a new line. Each line is then laid out as above, and lines are stacked with the row's gap between them.
4. **Heights.** A leaf's height comes from the component metrics (10.5 and Appendix C), and for text from the number of wrapped lines. A vertical container's height is the sum of its children's heights, plus gaps and padding. A horizontal container's height is its tallest child's, plus padding. An element with a fixed `height` has that height; content that doesn't fit is clipped, with `W601`. A percentage `height` is of the parent's content height when the parent has a fixed height or is a screen's body; otherwise it is ignored, with `W205`.
   - **Free room in vertical containers.** A screen's body column (section 10.3, step 8) is at least as tall as the room the device leaves for it, so a `spacer` or a child with `grow` in it can take the room left over. Any other vertical container has room left over only when it has a fixed `height`.
5. **Cross-axis alignment** follows `align`. `stretch` is the default in vertical containers, and `center` in horizontal ones. In a horizontal container, `stretch` makes every container child (and every `divider` and `sidebar`, whatever the alignment) as tall as the row; leaves keep their own height and sit at the top.
6. **Main-axis placement** follows `justify` when no child grows.
7. **`grid`.** The column width is (content width − gaps) ÷ `cols`, shared as in section 10.1. A child with `span=N` takes N columns and the gaps between them. Children fill rows left to right, and a child that doesn't fit starts a new row. Each row is as tall as its tallest child, and every child in the row is stretched to that height.
8. **`sidebar`, `header`, `footer`.** A screen first sets aside its `header` (top, full width), `footer` (bottom, full width) and `sidebar` (left, or right, between the header and the footer) children, in that order. Its other children, in source order, are its **body**: a column, with the screen's padding, in the area that remains. The frame is as tall as the device, or as tall as its content needs if that is more, and the footer sits at the bottom of the frame. A `sidebar` inside a `row` is an ordinary child of that row with a fixed width (its `width`, or 240 px), stretched to the row's height.
9. **Overlays.** A `modal` is centred on the screen, 480 px wide by default and no wider than the screen minus 8u. It is centred vertically within the device height, and no higher than 4u from the top. A `drawer` is 360 px wide (or 50% of the screen height for `bottom`) and fills the screen along its edge. While an overlay is open, the rest of the frame is dimmed (Appendix C.8).

### 10.4 Intrinsic and minimum widths

- **Text** (`h1` to `h3`, `text`, `label`, `link`, `badge`): the measured width of its label on one line (section 11). A `text` with no label (placeholder lines) is 240 px wide, with a minimum of 96 px.
- **`button`:** the label width plus 8u, plus 6u if it has an icon. A button with an icon and no label is as wide as it is tall.
- **Field controls** (`input`, `textarea`, `select`): 240 px. Minimum 96 px.
- **`checkbox`, `radio` option, `toggle`:** the mark's width plus 2u plus the label width.
- **`icon`:** 16, 20 or 24 px for `sm`, default, `lg`. **`avatar`:** 24, 32 or 48 px.
- **`image`:** 160 px, unless `width` says otherwise. In a container that stretches its children, it takes the full width like any other child. Its height is its width divided by its `ratio` (4:3 if none), unless it sets `height`.
- **Containers:** from their children, by the rules in 10.3.
- The minimum width of text is the width of its longest word. For other leaves it is their intrinsic width, unless stated above.

### 10.5 Component metrics

| Component | Height | Type |
| --- | --- | --- |
| `h1` | Line height 40 px | 32 px, weight 700 |
| `h2` | Line height 32 px | 24 px, weight 700 |
| `h3` | Line height 24 px | 18 px, weight 600 |
| `text` | Line height 22 px per line | 15 px, weight 400 |
| `label`, `badge` | Line height 18 px | 13 px, weight 500 |
| `button` | 9u (7u for `sm`, 11u for `lg`) | 15 px, weight 600 |
| `input`, `select` | 10u, plus an 18 px label line and a 1u gap when there's a label | 15 px, weight 400 |
| `textarea` | `rows` × 22 px + 4u (3 rows by default), plus the label | 15 px, weight 400 |
| `checkbox`, `radio` option, `toggle` | 6u | 15 px, weight 400 |
| Table row | 10u | 14 px; header weight 600 |
| `item` | 9u | 15 px, weight 400 |
| `header`, `footer` | Content height plus 2 × 3u | |
| `divider` | The `stroke` token | |

Appendix C gives the complete geometry of every component, including marks, borders, padding and placeholder shapes. Where this table and Appendix C overlap they agree; Appendix C adds the rest.

### 10.6 Arrows in the overview

1. An arrow leaves the middle of its source element's right edge. If the target frame is to the left, it leaves the left edge.
2. It runs horizontally to the gap between frames, vertically to the height of its entry point, then horizontally into the target frame's nearest vertical edge, entering 48 px below the frame's top.
3. A gap is the space between two columns of a group (section 7.4), between two groups, or before the first group of a band. It runs the full height of its band, so an arrow in it never crosses a frame. The gap to the right of a frame begins at its column's right edge, not at the frame's. Arrows that share a gap are spread across it at equal spacing, in source order: with n arrows in a gap of width w, the k-th (from 1) runs at w × k ÷ (n + 1) from the gap's left edge. A gap belongs to one band: gaps in different bands are different gaps, even where they line up.
4. A link to a variant below its base runs down the gap to the left of the variant.
5. When the target frame is not across the gap next to the source frame, the arrow climbs or drops down its gap to a lane above the band that holds the target, runs along the lane, and drops down the gap beside the target. That covers a target in the same band, or in the band just below. Lanes are 12 px apart, starting 12 px above that band's frame titles, numbered in link order for each band. The space above each band grows by 12 px for each of its lanes.
   - **A target in a band above, or more than one band below.** The arrow climbs to a lane above its own band (or drops to a lane above the band below it), runs along that lane to the left margin, runs up or down the margin to a lane above the target's band, then along that lane and down the gap beside the target. It takes the first lane, then the second, in that order. The left margin is one gap for the whole canvas, so arrows in it are spread across it like arrows in any gap. Arrows that start or end beside the first group of a band use it too.
6. Links are numbered in source order: elements' links in a depth-first walk of each screen, screens in source order, then `flow` lines.
7. Arrows are drawn as described in Appendix C.9. Overlapping arrows beyond these rules are allowed.

## 11. Text measurement

Renderers do not ask a browser or an operating system how wide text is. They use the metrics tables that ship with the spec version (Appendix A).

- **Characters.** A character is a Unicode code point.
- **Width.** The width of a string is the sum of its characters' advance widths in the table for that font and weight, in font units, multiplied by the font size and divided by the table's `unitsPerEm`, then rounded (section 10.1). There is no kerning, no ligatures and no shaping.
- **Unknown characters.** A character missing from the table uses the table's `default` advance, which is the advance of the font's missing-character box. Characters outside the Basic Multilingual Plane count as two `default` advances.
- **Weights.** Each font has a table for weights 400, 500, 600 and 700. Source Serif 4 has no separate weight 500 at its default size, so its 500 table is a copy of its 400 table, and a renderer draws serif at weight 500 with the regular face, as font matching does.
- **Wrapping.** Text breaks only at spaces (U+0020) and at `\n`. Words are placed greedily. A space at a break is dropped. A word wider than the line is placed on a line of its own and clipped, with `W602`.
- **Truncation.** Single-line components (`button`, `label`, `badge`, `item`, tabs, nav entries, breadcrumbs, table cells, field values and captions) do not wrap. Text that doesn't fit is cut: it is replaced by the longest prefix for which the prefix followed by `…` fits. If `…` alone doesn't fit, nothing is drawn.
- **Baseline.** The first baseline is at (line height − font size) ÷ 2 + ascent, where ascent is the table's `ascent` (the font's hhea ascender) scaled like a width. Each further line is one line height lower.
- **Direction.** v0.1 lays out text left to right only.

A renderer MUST set an explicit `x` and `y` on every text element, so the reader's font engine decides only how glyphs look, never where lines break. Each line of wrapped text is its own `text` element. Text is placed by its left edge (`text-anchor` is never used), so centred text is positioned using its measured width.

## 12. SVG output

### 12.1 Allowed content

The output is one self-contained SVG 1.1 document. It contains only these elements: `svg`, `title`, `desc`, `metadata`, `defs`, `clipPath`, `marker`, `g`, `rect`, `circle`, `line`, `path`, `text`, `tspan`, and, in interactive mode only, `a` with an `href` that is a fragment (`#…`) inside the same document.

It MUST NOT contain `script`, `style`, `foreignObject`, `image`, `use` with an external reference, `iframe`, event attributes, or any URL other than those fragments. Styling uses presentation attributes only.

The only other element is the `wl:source` element inside `metadata` (section 12.3). Each element may carry only the attributes listed for it in Appendix D, in the order listed there.

**Escaping.** Every string that comes from a source or a theme is written as character data, never as markup. In text content, `&`, `<` and `>` are written as `&amp;`, `&lt;` and `&gt;`. In attribute values, `"` is also written as `&quot;`. No other characters need escaping, because a source cannot contain the characters XML forbids (section 3).

### 12.2 Structure, ids and classes

- The root has `viewBox`, `width`, `height`, `role="img"` and `aria-labelledby` pointing at its `title` and `desc`, whose ids are `<idPrefix>-title` and `<idPrefix>-desc`. It also has `xml:space="preserve"`, so runs of spaces are drawn as they were measured.
- **`title`** is the screen's title when the output shows one screen (with or without overlay frames), `Theme: <name>` for a specimen, and otherwise "*N* screens", where N counts every `screen`, variants included. **`desc`** is one sentence: `Screens: <titles, separated by ", ">. <L> links.` (`1 link.` when there is one), for example `Screens: Sign in, Home. 1 link.`
- Each screen is a `g` with `class="wl-screen"`, an id, and its own `title`.
- Each element is a `g` with `class="wl-<component>"`. State flags add classes, for example `wl-button wl-primary wl-disabled`.
- **Ids** are `<idPrefix>-<source id>` for elements that have an id in the source, and `<idPrefix>-n<index>` otherwise, where the index is the element's position in a depth-first, pre-order walk of the syntax tree, from 0. The walk covers the screens, in source order, and everything under them, screens included; themes and `flow` lines are not counted. An extra frame for an overlay is a `g` with the id `<idPrefix>-<overlay's id>-frame`. Elements drawn again inside an extra frame put the frame's name before their own, as `<idPrefix>-<overlay's id>-frame-<element's id>`, so that every id in the document is unique. The notes list below a frame is a `g` with the id `<frame's id>-notes`.
- Text is drawn as `text` elements, never as outlines. `font-family` is exactly `Inter, sans-serif`, `'Source Serif 4', serif` or `'JetBrains Mono', monospace`.
- **Numbers** are written with at most one decimal place and no trailing zero: `12`, `12.5`, `-3`. Every position is already a multiple of 0.5 (section 10.1). `-0` is written `0`. There are three exceptions: opacities are written as given in Appendix C; an icon's scale and stroke width are written with up to four decimal places (Appendix C.1); and an icon's drawing is copied exactly as it is in `icons.json`.
- Attribute order within an element (Appendix D), number formatting and element order (source order, overlays last, notes after those, arrows after those) are fixed, so that outputs can be compared byte for byte after the normalisation the conformance suite defines.

### 12.3 Embedded source

With `embedSource` on, the SVG carries its own source, so a picture can be turned back into text:

```xml
<metadata>
  <wl:source xmlns:wl="urn:wirelith:source" version="0.1">…the source, XML-escaped…</wl:source>
</metadata>
```

The source is written exactly as given, after the decoding rules of section 3 (a byte-order mark is dropped and CRLF becomes LF), and XML-escaped as text content.

A PNG produced from that SVG SHOULD carry the same text in an `iTXt` chunk with the keyword `wirelith-source`, uncompressed, with empty language and translated-keyword fields. A PDF SHOULD carry it as an embedded file named `source.wirelith`.

A tool that reads a source back MUST treat it as untrusted input, like any other source.

### 12.4 Accessibility

- Every screen group has a `title`.
- An `image` placeholder's description, an `icon`'s name and an `avatar`'s name are exposed as that group's `title`.
- Purely decorative shapes are inside a `g` that carries `aria-hidden="true"`.
- Notes are real text in the output, in reading order after their screen.

## 13. Syntax tree

A parser produces a tree. Its JSON form is the interchange format for tools and for the conformance suite.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Wirelith syntax tree 0.1",
  "type": "object",
  "required": ["type", "version", "screens"],
  "properties": {
    "type": { "const": "document" },
    "version": { "type": "string", "pattern": "^[0-9]+\\.[0-9]+$" },
    "theme": {
      "type": "object",
      "required": ["name"],
      "properties": {
        "name": { "type": "string" },
        "extends": { "type": "string" },
        "tokens": { "type": "object", "additionalProperties": { "type": ["string", "number"] } },
        "loc": { "$ref": "#/$defs/loc" }
      }
    },
    "screens": { "type": "array", "items": { "$ref": "#/$defs/node" } },
    "flows": { "type": "array", "items": { "$ref": "#/$defs/flow" } }
  },
  "$defs": {
    "loc": {
      "type": "object",
      "required": ["line", "column"],
      "properties": {
        "line": { "type": "integer", "minimum": 1 },
        "column": { "type": "integer", "minimum": 1 }
      }
    },
    "link": {
      "type": "object",
      "required": ["to"],
      "properties": { "to": { "type": "string" }, "label": { "type": "string" } }
    },
    "flow": {
      "type": "object",
      "required": ["from", "to", "loc"],
      "properties": {
        "from": { "type": "string" },
        "to": { "type": "string" },
        "label": { "type": "string" },
        "loc": { "$ref": "#/$defs/loc" }
      }
    },
    "value": {
      "oneOf": [
        { "type": "string" },
        { "type": "number" },
        { "type": "array", "items": { "type": "string" } },
        { "type": "object", "required": ["ref"], "properties": { "ref": { "type": "string" } } }
      ]
    },
    "node": {
      "type": "object",
      "required": ["type", "loc"],
      "properties": {
        "type": { "type": "string" },
        "id": { "type": "string" },
        "label": { "type": "string" },
        "items": { "type": "array", "items": { "type": "string" } },
        "flags": { "type": "array", "items": { "type": "string" } },
        "attrs": { "type": "object", "additionalProperties": { "$ref": "#/$defs/value" } },
        "link": { "$ref": "#/$defs/link" },
        "children": { "type": "array", "items": { "$ref": "#/$defs/node" } },
        "loc": { "$ref": "#/$defs/loc" }
      }
    }
  }
}
```

Rules for producing the tree:

- `type` is the component name as written. A `row` directly under a `table` has the type `table-row`.
- Ids and references are stored without the `#`. An attribute whose value is an id, such as `for=#place`, is stored as `{ "ref": "place" }`.
- `flags` keep source order. `attrs` hold bare numbers (section 3) as numbers, lists as arrays of strings, and everything else as strings. A flag or attribute given twice keeps its last value, and a flag appears once.
- Optional members are left out rather than written empty: a node with no label has no `label`, and so on. `screens` is always present, and is `[]` for a source with no screens. `flows` is present only when the source has `flow` lines.
- `theme` is present when the source has a `theme` line (`{ "name": … }`) or block (`{ "name": …, "extends": …, "tokens": { … } }`, with token values as written, numbers as numbers).
- A source with no header line has the `version` of the spec the parser implements.
- Comments and blank lines are not in the tree.
- The tree's JSON form, as the conformance suite compares it, has members in the order of the schema above and is otherwise compared as data, not as text.

### 13.2 Outline

The outline of a source is a summary that tools can use without laying it out: its screens, each screen's overlays, and every link. Its JSON form, shown here for an abridged source:

```json
{
  "screens": [
    {
      "id": "signin",
      "title": "Sign in",
      "device": { "name": "phone", "width": 390, "height": 844 },
      "overlays": []
    },
    {
      "id": "signin-error",
      "title": "Sign in",
      "device": { "name": "phone", "width": 390, "height": 844 },
      "of": "signin",
      "state": "Wrong password",
      "overlays": [{ "id": "help", "type": "modal", "title": "Help", "open": false }]
    }
  ],
  "links": [
    {
      "kind": "element",
      "from": { "screen": "signin", "element": { "id": "go", "index": 4, "type": "button", "line": 6 } },
      "to": "home",
      "label": "Signs in"
    },
    { "kind": "flow", "from": { "screen": "signup" }, "to": "signin" }
  ]
}
```

- `screens` lists every screen in source order. `id` is the screen's id, or `n<index>` (section 12.2) when it has none. `device.name` is `phone`, `tablet`, `desktop` or `custom` (for `size=`). A variant has `of` and `state`; others do not.
- `overlays` lists each `modal` and `drawer` directly in the screen, in source order. `title` is left out when there is none.
- `links` lists every link in the order of section 10.6, rule 6. An element link's `from.element` has the element's `id` (when it has one), its `index` from section 12.2, its `type`, and its source `line`. `label` is left out when there is none.
- The outline is defined only for sources without errors.

## 14. Versioning and compatibility

- **Spec versions** are `MAJOR.MINOR`. This is 0.1.
- **Declaring a version.** The first line of a source MAY be `wirelith 0.1`. Tools that write sources SHOULD include it.
- **While the major version is 0,** any minor version may change or remove syntax. Each release lists its changes, and where a change can be made mechanically the reference tools provide an upgrade command.
- **From 1.0,** a source that is valid in 1.x stays valid, with the same meaning, in every later 1.y. New components, flags and attributes may be added in minor versions.
- **A renderer given a newer minor version** than it implements MUST report `W101` and SHOULD still try to render. Given a newer major version, it MUST stop with `E103`. For a 0.1 renderer, `0.2` and later `0.x` versions are newer minor versions, and `1.0` and later are newer major versions.
- **Rendering changes.** Any change to layout or metrics that moves a pixel in a conformance output is a new minor version.
- **Implementations** have their own version numbers. Each states which spec versions it implements.

## 15. Errors and warnings

A validator returns a list of diagnostics. Each has a `code`, a `severity` (`error` or `warning`), a `line` and `column` (both from 1), a `message`, and optionally a `hint`.

- An **error** means the source cannot be drawn as written. A renderer given a source with errors draws nothing from it and shows the diagnostics.
- A **warning** means the source was drawn, but probably not as the author meant.
- Codes are stable. A code is never reused for a different meaning, so tools and agents may key on them. Message wording may improve between versions.
- **Positions.** `line` and `column` are counted from 1, and columns count Unicode code points. A syntax error (`E101` to `E106`, `E201`) points at the start of the part that is wrong. A diagnostic about what an element means (`E203`, `E204`, `E301`, `E401`, `E402`, `W202`, `W205`, `W301`, `W302`, `W403`, `W601`, `W602`) points at the start of the element's line: its component name. Problems of one code on one element are reported as one diagnostic whose message lists them all. A diagnostic about the whole source (the source-size cap) is at line 1, column 1. A diagnostic about a theme the host supplied is at the `theme` line when the source has one, and otherwise at line 1, column 1.
- **Order.** Diagnostics are sorted by line, then column, then code. The same code is not reported twice at the same position.
- **Recovery.** A validator reports every problem it can find, not just the first. A line with an error is skipped, together with its children. The size caps are checked first; if one is exceeded, only that `E701` is reported.
- The conformance suite compares `code`, `severity`, `line` and `column`, never the message.

| Code | Severity | Meaning | Example message |
| --- | --- | --- | --- |
| `E101` | Error | Bad indentation | Line 4: indentation must be a multiple of 2 spaces |
| `E102` | Error | Tab in indentation | Line 4: use 2 spaces, not a tab |
| `E103` | Error | Unsupported major version | This source targets Wirelith 2.0; this renderer supports 0.1 |
| `E104` | Error | Unclosed string or list | Line 7, column 12: this string has no closing quote |
| `E105` | Error | Something at the top level that isn't `screen`, `theme` or `flow` | Line 1: "button" must be inside a screen |
| `E106` | Error | Malformed part | Line 5, column 20: expected a value after "width=" |
| `E201` | Error | Unknown component | Line 6: there is no "textfield". Did you mean "input"? |
| `E203` | Error | Component in the wrong place | Line 9: "modal" must be directly inside a screen |
| `E204` | Error | Children on a component that takes none | Line 12: "button" cannot contain other elements |
| `E301` | Error | Duplicate id | Line 14: #save is already used on line 8 |
| `E401` | Error | A link, `flow`, `for=` or `of=` names an id that doesn't exist, or an element that can't be its target | Line 5: there is no #dashbord. Did you mean #dashboard? |
| `E402` | Error | A link to an overlay, or a note's `for=`, names an element in another screen | Line 5: #confirm is in a different screen |
| `E501` | Error | More than one theme | Line 3: a source can have only one theme |
| `E506` | Error | Theme `extends` loops or is too deep | Theme "a" extends itself |
| `E701` | Error | A size cap was exceeded (section 16) | This source has 2,340 elements; the limit is 2,000 |
| `W101` | Warning | Newer minor version than the renderer implements | This source targets 0.3; rendering as 0.1 |
| `W202` | Warning | Unknown flag or attribute for this component | Line 6: "button" has no "colour" (it has: primary, secondary, danger, disabled, icon, sm, lg) |
| `W205` | Warning | Value outside the allowed set | Line 8: gap="huge" is not a size; using md |
| `W301` | Warning | Unknown icon | Line 9: there is no icon "person". Did you mean "user"? |
| `W302` | Warning | `active` or `value` names an entry that isn't in the list | Line 4: "Billing" is not one of the tabs |
| `W403` | Warning | A screen that nothing links to, in a source that has links. The first screen and all variants are exempt; a `flow` counts as a link. | Screen #help is never reached |
| `W502` | Warning | Theme name not found | There is no theme "fernway"; using paper |
| `W503` | Warning | Unknown theme token | Line 3: there is no token "shadow" |
| `W504` | Warning | Theme value invalid or out of range | Line 4: radius must be 0 to 16 |
| `W505` | Warning | Low contrast in a theme | Text on surface has contrast 2.1:1 |
| `W601` | Warning | Content doesn't fit: a row too wide for its container, content taller than a fixed `height`, or a table row with more cells than the table has columns | Line 10: this row is 120 px too wide for its container |
| `W602` | Warning | A word is wider than its line | Line 11: a word was clipped |

Messages are plain sentences that name the line, say what is wrong, and where possible say what to write.

## 16. Security considerations for hosts

Wirelith is designed to be safe to render from untrusted input: a document written by a stranger, a model's reply, or a file from the internet.

**What the language guarantees**

- A source can't cause a network request. There are no URLs, images, fonts or includes to fetch.
- A source can't run code. The output contains no script, style sheet or event handler.
- A source can't add markup. Every string is emitted as escaped text.
- A source can't impersonate a real product. There are no pictures, logos, brand icons or custom fonts, and the look is fixed by a small set of tokens.

**What a host must still do**

- **Insert the SVG as an SVG document or parsed DOM, not by string concatenation into HTML,** and keep its normal content security policy. A conforming renderer's output passes a strict allowlist sanitiser unchanged, and hosts are encouraged to run one anyway.
- **Enforce the caps.** A conforming renderer MUST reject sources beyond these limits with `E701`. A host MAY set lower ones.

| Limit | Value |
| --- | --- |
| Source size | 64 KB |
| Elements | 2,000 |
| Screens | 50 |
| Nesting depth | 16 |
| String length | 500 characters |
| List items | 100 |
| Table size | 20 columns, 200 rows |
| Links and flows | 500 |
| Output canvas | 16,000 px on either side |

How the caps are counted:

- **Source size** is the number of bytes of UTF-8, so 64 KB is 65,536 bytes.
- **Elements** are the nodes of the syntax tree: screens and everything under them. Theme lines and `flow` lines are not elements.
- **Nesting depth** counts a screen as depth 1, its children as depth 2, and so on.
- **String length** is in Unicode code points, and applies to labels, list items, attribute values, theme names and token values.
- **Table size** counts the table's column names, and its rows as its child rows plus any `rows=N`.
- **Links and flows** counts every `->` and every `flow` line.

Every cap except the output canvas is checked before layout. The output canvas can only be measured after layout: it is checked then, before any SVG is produced, and exceeding it is also `E701`. Numeric attributes have their own limits (section 5.10); a value beyond them is ignored with `W205`, so it can never reach layout.

- **Bound the time.** Rendering is linear in the number of elements, and arrow routing is bounded by the link cap. Hosts that render on a server SHOULD still set a time limit.
- **Treat theme input as untrusted,** including themes the host loads from its own users. Validation (section 9.5) applies to every theme.
- **Prefix ids** with `idPrefix` when more than one output shares a page, so ids don't collide with the host's.
- **Treat embedded source as untrusted** when reading it back from an SVG, PNG or PDF.
- **Don't log sources or outputs by default.** Wireframes often describe unreleased products.

## 17. Out of scope

These are deliberately not part of the language, and requests to add them should be declined:

- high-fidelity or pixel-perfect design
- arbitrary colours, sizes or styling on individual elements
- real images, whether from a URL, a file or inline data
- brand logos and custom icon sets
- custom or downloadable fonts
- HTML, CSS, scripts, or any passthrough to the host
- animation and timed transitions
- data binding, variables, loops, conditionals, includes or imports
- hand-drawn or randomised rendering, which would break determinism

## 18. Worked examples

All products below are made up.

### 18.1 Analytics dashboard

```wirelith
wirelith 0.1

screen "Juniper Analytics" desktop #dashboard
  sidebar
    h3 "Juniper"
    nav [Overview, Reports, Audiences, Settings] active="Overview" vertical
  header
    h2 "Overview"
    spacer
    select [Last 7 days, Last 30 days, This year] value="Last 30 days"
    avatar "Sam Rivera"
  grid cols=4
    card "Visitors"
      h2 "48,210"
      badge "+12%" success
    card "Sign-ups"
      h2 "1,304"
      badge "+4%" success
    card "Conversion"
      h2 "2.7%"
      badge "-0.3%" danger
    card "Revenue"
      h2 "$92,400"
      badge "+9%" success
  row
    card "Visitors over time" grow
      image "Line chart, 30 days" ratio=16:6
    card "Top pages" width=360
      table [Page, Views]
        row [/pricing, "12,402"]
        row [/docs, "9,870"]
        row [/blog, "7,115"]
```

### 18.2 Sign-in flow

```wirelith
wirelith 0.1

screen "Sign in" phone #signin
  h1 "Welcome back"
  input "Email" type=email placeholder="you@example.com"
  input "Password" type=password
  row justify=between
    checkbox "Remember me"
    link "Forgot password?" -> #reset
  button "Sign in" primary -> #home
  text "New here?" muted align=center
  link "Create an account" -> #signup

screen "Sign in" #signin-error of=#signin state="Wrong password"
  h1 "Welcome back"
  input "Email" type=email value="sam@example.com"
  input "Password" type=password error="That password doesn't match"
  button "Sign in" primary

screen "Reset password" phone #reset
  h1 "Reset your password"
  text "We'll email you a link."
  input "Email" type=email
  button "Send link" primary -> #signin "Back to sign in"

screen "Create account" phone #signup
  h1 "Create your account"
  input "Name"
  input "Email" type=email
  input "Password" type=password
  button "Create account" primary -> #home

screen "Home" phone #home
  h1 "Hello, Sam"
  empty "Nothing here yet"

flow #signup -> #signin "If the email is already registered"
```

### 18.3 Settings page

```wirelith
wirelith 0.1

screen "Settings" desktop #settings
  header
    h2 "Settings"
  tabs [Profile, Notifications, Billing] active="Notifications"
    card "Email"
      toggle "Product updates" on
      toggle "Weekly summary" on
      toggle "Comments on my work"
    card "Push"
      toggle "Mentions" on
      toggle "Reminders"
      select "Quiet hours" [Off, Nights, Nights and weekends] value="Nights"
    row justify=end
      button "Cancel"
      button "Save changes" primary #save
  note "Save stays disabled until something changes" for=#save
```

### 18.4 Data table with filters

```wirelith
wirelith 0.1

screen "Orders" desktop #orders
  header
    h2 "Orders"
    spacer
    button "Export" icon=download
    button "New order" primary -> #new-order
  row
    input placeholder="Search orders" type=search grow
    select [Any status, Paid, Pending, Refunded] value="Any status"
    select [Any date, Today, This week, This month] value="This week"
    button "Clear filters"
  table [Order, Customer, Status, Total, Placed]
    row ["#1042", Ada Park, Paid, "$128.00", 2 hours ago] selected
    row ["#1041", Luis Ortega, Pending, "$64.50", 5 hours ago]
    row ["#1040", Mei Tanaka, Refunded, "$210.00", Yesterday]
    row ["#1039", Omar Haddad, Paid, "$19.99", Yesterday]
  row justify=between
    text "Showing 1 to 4 of 212" muted
    row
      button "Previous" disabled
      button "Next"
  drawer "New order" #new-order
    input "Customer"
    select "Product" [Starter, Team, Enterprise]
    input "Quantity" type=number value="1"
    button "Create order" primary

screen "Orders" #orders-empty of=#orders state="No results"
  header
    h2 "Orders"
  empty "No orders match these filters"
    button "Clear filters"
```

### 18.5 E-commerce product page

```wirelith
wirelith 0.1
theme "fernway" extends=paper
  color.primary #1f6f5c
  radius 10

screen "Fernway: Canvas Tote" desktop #product
  header
    h3 "Fernway"
    nav [New, Bags, Home, Sale]
    spacer
    input placeholder="Search" type=search width=240
    button "Cart" icon=shopping-cart -> #cart
  breadcrumbs [Home, Bags, Canvas Tote]
  row gap=xl
    column width=50%
      image "Product photo" ratio=1:1
      row
        image "Thumbnail 1" width=96 ratio=1:1
        image "Thumbnail 2" width=96 ratio=1:1
        image "Thumbnail 3" width=96 ratio=1:1
    column grow
      h1 "Canvas Tote"
      row
        h2 "$48"
        badge "In stock" success
      text "A roomy everyday bag in heavyweight cotton canvas."
      radio "Colour" [Natural, Olive, Black] value="Olive"
      select "Quantity" [1, 2, 3, 4] value="1"
      button "Add to cart" primary lg -> #cart
      list [Free shipping over $75, 30-day returns, Made to last]
  drawer "Your cart" #cart
    list
      item "Canvas Tote, Olive" badge="1"
    divider
    row justify=between
      label "Subtotal"
      label "$48"
    button "Check out" primary
```

### 18.6 Mobile navigation pattern

```wirelith
wirelith 0.1

screen "Kettle: Recipes" phone #recipes
  header
    button icon=menu -> #menu
    h3 "Recipes"
    spacer
    button icon=search
  list
    item "Lemon pasta" -> #recipe
    item "Tomato soup"
    item "Flatbread"
  footer
    nav [Recipes, Plan, Shopping, Profile] active="Recipes"
  drawer "Menu" left #menu
    avatar "Sam Rivera" lg
    nav [Recipes, Favourites, Settings, Help] active="Recipes" vertical

screen "Kettle: Lemon pasta" phone #recipe
  header
    button icon=arrow-left -> #recipes
    h3 "Lemon pasta"
  image "Photo of the dish" ratio=4:3
  tabs [Ingredients, Steps] active="Ingredients"
    list [200 g spaghetti, 1 lemon, 2 tbsp olive oil, Parmesan]
  footer
    button "Add to plan" primary grow
```

### 18.7 Document editor

```wirelith
wirelith 0.1

screen "Pagecraft: Launch plan" desktop #editor
  header
    button icon=arrow-left
    h3 "Launch plan"
    badge "Saved"
    spacer
    avatar "Ada Park" sm
    avatar "Luis Ortega" sm
    button "Share" primary -> #share
  sidebar width=240
    label "Outline" muted
    list
      item "Goals" active
      item "Timeline"
      item "Risks"
  sidebar right width=300
    h3 "Comments"
    card
      row
        avatar "Luis Ortega" sm
        label "Luis Ortega"
      text "Can we move the date up a week?"
      input placeholder="Reply"
  row
    button icon=bold sm
    button icon=italic sm
    button icon=list sm
    button icon=link sm
    divider
    select [Paragraph, Heading 1, Heading 2] value="Paragraph"
  h1 "Launch plan"
  text lines=4
  h2 "Goals"
  text lines=3
  modal "Share this document" #share
    input "Invite by email" type=email
    radio "Access" [Can view, Can comment, Can edit] value="Can comment"
    row justify=end
      button "Cancel"
      button "Send invite" primary
```

## Appendix A. Font metrics

The tables are in `spec/data/fonts`, one JSON file per font and weight: `sans-400.json` to `sans-700.json`, `serif-400.json` to `serif-700.json` and `mono-400.json` to `mono-700.json`. They are data, not code, and are part of this specification.

Each table has:

| Field | Meaning |
| --- | --- |
| `font` | The allowlist name: `sans`, `serif` or `mono` |
| `family`, `version` | The font family and its version |
| `weight` | 400, 500, 600 or 700 |
| `file` | The font file the table was measured from |
| `unitsPerEm` | Font units per em |
| `ascent`, `descent` | The font's hhea ascender and descender, in font units |
| `default` | The advance of the font's missing-character box (glyph 0), in font units |
| `advances` | A map from each character the font draws to its advance, in font units |

The tables cover every character the font maps in U+0020 to U+024F, U+2000 to U+206F, U+20A0 to U+20CF and U+2190 to U+21FF. Any other character uses `default`.

| Name | Family | Version | License |
| --- | --- | --- | --- |
| `sans` | Inter | 4.1 | SIL Open Font License 1.1 |
| `serif` | Source Serif 4 | 4.005 | SIL Open Font License 1.1 |
| `mono` | JetBrains Mono | 2.304 | SIL Open Font License 1.1 |

The tables are generated from the pinned font files by `spec/generators/font-metrics.mjs`, which checks each file's SHA-256 against `spec/generators/inputs.lock.json`. Source Serif 4 has no separate weight 500 at its default size; `serif-500.json` is measured from the regular face (section 11).

## Appendix B. Icon names

The icons are a curated subset of Lucide 1.62.0 (ISC License; some icons also under the MIT License, as stated in Lucide's license). The set contains no brand or product logos. The drawings are in `spec/data/icons.json`, generated by `spec/generators/icons.mjs` from the curated list `spec/generators/icons.txt`.

Twelve of the names are other names Lucide gives an icon, and draw that icon: `building-2`, `circle-help`, `file-audio`, `file-video`, `filter`, `fingerprint`, `frown`, `history`, `meh`, `music`, `smile` and `trash-2`. In `icons.json`, `names` maps every valid name to its drawing.

The valid icon names for 0.1 are:

**Actions:** `plus`, `minus`, `x`, `check`, `check-check`, `search`, `zoom-in`, `zoom-out`, `filter`, `funnel`, `settings`, `settings-2`, `sliders-horizontal`, `sliders-vertical`, `pencil`, `pen`, `square-pen`, `eraser`, `trash`, `trash-2`, `copy`, `clipboard`, `clipboard-check`, `clipboard-list`, `scissors`, `save`, `download`, `upload`, `share`, `share-2`, `link`, `link-2`, `unlink`, `external-link`, `refresh-cw`, `refresh-ccw`, `rotate-cw`, `rotate-ccw`, `undo`, `redo`, `undo-2`, `redo-2`, `repeat`, `shuffle`, `log-in`, `log-out`, `power`, `lock`, `lock-open`, `key`, `key-round`, `eye`, `eye-off`, `printer`, `send`, `reply`, `reply-all`, `forward`, `archive`, `paperclip`, `pin`, `bookmark`, `flag`, `tag`, `tags`, `hash`, `at-sign`, `sparkles`, `wand-sparkles`.

**Arrows and chevrons:** `arrow-up`, `arrow-down`, `arrow-left`, `arrow-right`, `arrow-up-right`, `arrow-down-left`, `arrow-up-down`, `arrow-left-right`, `arrow-down-up`, `arrow-up-narrow-wide`, `arrow-down-wide-narrow`, `chevron-up`, `chevron-down`, `chevron-left`, `chevron-right`, `chevrons-up`, `chevrons-down`, `chevrons-left`, `chevrons-right`, `chevrons-up-down`, `corner-down-left`, `corner-up-left`, `corner-up-right`, `move`, `move-vertical`, `move-horizontal`, `maximize`, `minimize`, `maximize-2`, `minimize-2`, `expand`, `shrink`.

**Status:** `info`, `circle-alert`, `triangle-alert`, `octagon-alert`, `circle-help`, `circle-check`, `circle-x`, `circle-plus`, `circle-minus`, `circle-dot`, `ban`, `loader`, `loader-circle`, `badge-check`, `shield`, `shield-check`, `shield-alert`, `bell`, `bell-off`, `bell-ring`, `star`, `heart`, `thumbs-up`, `thumbs-down`, `award`, `trophy`, `crown`, `smile`, `frown`, `meh`.

**Layout and navigation:** `menu`, `ellipsis`, `ellipsis-vertical`, `grip-vertical`, `grip-horizontal`, `panel-left`, `panel-right`, `panel-top`, `panel-bottom`, `layout-grid`, `layout-list`, `layout-dashboard`, `layout-template`, `columns-2`, `rows-2`, `grid-3x3`, `list`, `list-ordered`, `list-checks`, `list-todo`, `list-filter`, `table`, `table-2`, `kanban`, `app-window`, `layers`, `house`, `building`, `building-2`, `map`, `map-pin`, `navigation`, `compass`, `globe`, `locate`, `route`, `square`, `circle`, `square-check`, `square-x`, `toggle-left`, `toggle-right`.

**People and accounts:** `user`, `users`, `user-plus`, `user-minus`, `user-check`, `user-x`, `user-round`, `user-cog`, `circle-user`, `contact`, `id-card`, `fingerprint`, `scan-face`, `accessibility`, `languages`.

**Communication:** `mail`, `mail-open`, `inbox`, `message-circle`, `message-square`, `messages-square`, `phone`, `phone-call`, `megaphone`, `rss`, `headset`, `life-buoy`, `quote`.

**Files and documents:** `file`, `file-text`, `file-plus`, `file-minus`, `file-check`, `file-x`, `file-search`, `file-image`, `file-video`, `file-audio`, `file-code`, `file-spreadsheet`, `file-archive`, `files`, `folder`, `folder-open`, `folder-plus`, `folders`, `cloud`, `cloud-upload`, `cloud-download`, `cloud-off`, `book`, `book-open`, `notebook`, `newspaper`, `sticky-note`.

**Text and editing:** `bold`, `italic`, `underline`, `strikethrough`, `heading`, `heading-1`, `heading-2`, `heading-3`, `type`, `text-align-start`, `text-align-center`, `text-align-end`, `text-align-justify`, `code`, `code-xml`, `terminal`, `pilcrow`, `highlighter`, `palette`, `paintbrush`, `pipette`, `ruler`, `crop`, `shapes`.

**Media:** `image`, `images`, `camera`, `video`, `film`, `mic`, `mic-off`, `music`, `headphones`, `volume`, `volume-1`, `volume-2`, `volume-x`, `play`, `pause`, `circle-stop`, `skip-forward`, `skip-back`, `fast-forward`, `rewind`, `cast`.

**Devices and connectivity:** `monitor`, `laptop`, `smartphone`, `tablet`, `watch`, `keyboard`, `mouse`, `mouse-pointer`, `mouse-pointer-click`, `hand`, `pointer`, `server`, `database`, `hard-drive`, `cpu`, `wifi`, `wifi-off`, `bluetooth`, `battery`, `battery-charging`, `plug`, `signal`, `qr-code`, `scan`, `scan-line`, `usb`.

**Commerce and finance:** `shopping-cart`, `shopping-bag`, `shopping-basket`, `credit-card`, `wallet`, `banknote`, `receipt`, `dollar-sign`, `euro`, `pound-sterling`, `percent`, `coins`, `piggy-bank`, `gift`, `package`, `package-check`, `truck`, `store`, `ticket`, `calculator`, `briefcase`, `landmark`, `scale`.

**Charts and data:** `chart-bar`, `chart-column`, `chart-line`, `chart-pie`, `chart-area`, `trending-up`, `trending-down`, `activity`, `gauge`, `target`.

**Time and weather:** `calendar`, `calendar-days`, `calendar-check`, `calendar-plus`, `calendar-x`, `calendar-clock`, `clock`, `alarm-clock`, `timer`, `hourglass`, `history`, `sun`, `moon`, `cloud-sun`, `cloud-rain`, `snowflake`, `umbrella`, `thermometer`, `wind`, `zap`, `flame`, `droplet`.

**Everything else:** `lightbulb`, `rocket`, `plane`, `car`, `bus`, `bike`, `train-front`, `ship`, `mountain`, `coffee`, `utensils`, `shirt`, `graduation-cap`, `stethoscope`, `heart-pulse`, `pill`, `dumbbell`, `gamepad-2`, `puzzle`, `bug`, `git-branch`, `git-commit-horizontal`, `git-pull-request`, `git-merge`, `braces`, `workflow`, `network`, `box`, `boxes`, `component`, `blocks`, `frame`, `leaf`, `sprout`.

## Appendix C. Component geometry

This appendix completes section 10.5. With it, the layout and the drawing of every component are fixed. `u` is the theme's `space` token, `S` its `stroke` and `R` its `radius`. Colours are named by token: `surface` means `color.surface`, and so on. Every position and size is rounded as in section 10.1.

### C.1 Drawing conventions

- **Boxes.** Layout gives every element a box: x, y, width and height. Shapes are drawn within it. A stroke is centred on the shape's edge, as SVG draws it.
- **Outlined box.** A `rect` the size of the box, with `rx` = R, the fill named, `stroke` = `border` and `stroke-width` = S.
- **Text.** Each text element has the font size, weight and line height listed for it, and the colour `text` unless stated. Headings (h1 to h3), card, modal and drawer titles, table captions and screen titles in the overview use `font.heading`. Everything else uses `font.body`.
- **Single-line text in a box** is centred vertically: its line box (one line height tall) is centred in the box, and the baseline follows from section 11.
- **Icons** are a `g` with `transform="translate(x y) scale(k)"`, where k = size ÷ 24, `fill="none"`, `stroke` = the icon's colour, `stroke-width` = S ÷ k, `stroke-linecap="round"` and `stroke-linejoin="round"`. Its children are the icon's drawing from `icons.json`, with `fill="currentColor"` replaced by the icon's colour. The scale and the stroke width are written with up to four decimal places, rounded half up. An unknown icon is drawn as a `rect` from (4, 4) to (20, 20) in icon units.
- **Placeholder bar.** A `rect` 8 px tall with `rx` 4, `fill` = `border` and `fill-opacity="0.35"`.
- **Leaves drawn at their own width.** `badge`, `avatar`, `icon`, `checkbox`, `radio` and `toggle` keep their intrinsic width in a container that stretches its children, and sit at the start of the row of space they are given.
- **Decorative shapes** (dividers, bars, marks, outlines) carry no text and are inside groups that carry `aria-hidden="true"` where section 12.4 requires it.

### C.2 Screens and regions

| Part | Geometry |
| --- | --- |
| Frame | An outlined box with fill `surface`. The device size gives its width and its minimum height. |
| Screen padding (P) | 4u on `phone`, 6u otherwise (including `size=`) |
| Body | A column inside the area left by the header, footer and sidebars, with padding P, gap `md`, align `stretch` |
| `header` | Full frame width. Padding 3u top and bottom, P left and right. Its children are a row: gap `md`, align `center`, justify `start`. A `line` along its bottom edge, `stroke` = `border`, width S. Height: its content height plus 6u. |
| `footer` | As `header`, with the line along its top edge, at the bottom of the frame |
| `sidebar` (in a screen) | Width 240, or its `width`; from the bottom of the header to the top of the footer. Fill `bg` (a `rect`). Padding 4u. Its children are a column: gap `md`, align `stretch`. A `line` along its inner edge. |
| `sidebar` (in a row) | As above, with the row's height |

### C.3 Layout containers

| Component | Default padding | Default gap | Default align | Default justify | Draws |
| --- | --- | --- | --- | --- | --- |
| `row` | `none` | `md` | `center` | `start` | Nothing |
| `column` | `none` | `md` | `stretch` | `start` | Nothing |
| `grid` | `none` | `md` | — | — | Nothing |

- **`spacer`** draws nothing. With no `size`, in a container with a main axis, it takes the remaining room (section 10.3); anywhere else, and with `size`, it is that many pixels (or that size word) along its parent's main axis and 0 across it.
- **`divider`** in a vertical container is S tall and as wide as the container's content; in a horizontal container it is S wide and as tall as the container's content. It is drawn as a `line` through its middle, `stroke` = `border`, width S.

### C.4 Text

| Component | Size | Line height | Weight | Colour |
| --- | --- | --- | --- | --- |
| `h1` | 32 | 40 | 700 | `text` |
| `h2` | 24 | 32 | 700 | `text` |
| `h3` | 18 | 24 | 600 | `text` |
| `text` | 15 | 22 | 400 | `text`; `muted` with the `muted` flag |
| `label` | 13 | 18 | 500 | `text`; `muted` with the `muted` flag |
| `link` | 15 | 22 | 400 | `primary`; `muted` when `disabled` |

- `align` places each line within the box: `start` (and `stretch`) at the left, `center` centred, `end` at the right.
- A `link` that isn't disabled is underlined: a `line` from the start to the end of each line of text, 2 px below its baseline, `stroke` = `primary`, width 1.
- **`text lines=N`**, and `text` with no label and no `lines` (which draws 3), draws N placeholder bars, one per 22 px line, each centred in its line. Every bar is as wide as the box, except the last, which is 60% as wide.

### C.5 Controls

**`button`**

| Part | Geometry |
| --- | --- |
| Height | 9u; 7u with `sm`; 11u with `lg` |
| Shape | An outlined box, with the fill and stroke below |
| Padding | 4u left and right |
| Label | 15, weight 600, line height 22 |
| Icon | 16 px (20 px with `lg`), then a 2u gap before the label |
| Content | The icon and label are centred in the button together |
| Icon only | As wide as it is tall, with the icon centred |

| Style | Fill | Stroke | Label and icon |
| --- | --- | --- | --- |
| `secondary` (default) | `surface` | `border` | `text` |
| `primary` | `primary` | `primary` | `on-primary` |
| `danger` | `danger` | `danger` | `on-primary` |
| `disabled` (with any style) | `bg` | `border` | `muted` |

**`input`, `select`, `textarea`**

| Part | Geometry |
| --- | --- |
| Field label | When there is one: 13, weight 500, line height 18, then a 1u gap. `required` adds ` *`, with the `*` in `danger` (a `tspan`). |
| Box | An outlined box with fill `surface` (`bg` when `disabled`) and stroke `border` (`danger` when there is an `error`). Height 10u; for `textarea`, `rows` × 22 + 4u, with 3 rows by default. |
| Text | 15, weight 400, line height 22, starting 3u from the box's left edge. The `value` in `text` (`muted` when disabled), or else the `placeholder` in `muted`. A `password` value is drawn as one `•` per character. Single-line fields truncate. A `textarea` wraps its text from 2u below the box's top and clips it to the box. |
| Icons | 16 px, in `muted`: `search` 3u from the box's left edge (the text then starts 2u after it) for `type=search`; `calendar` 3u from the right edge for `type=date`; `chevron-down` 3u from the right edge for `select`. Text is truncated before a right-hand icon. |
| Error | With `error="…"`: a 1u gap below the box, then the message on one line: 13, weight 400, line height 18, colour `danger` |

**`checkbox`, `radio`, `toggle`**

| Part | Geometry |
| --- | --- |
| Line | Each option is 6u tall. The mark is centred vertically in it, and the label (15, weight 400) starts 2u after the mark. Disabled options draw their label in `muted` and fill their mark with `bg`. |
| Checkbox mark | A 16 × 16 `rect` with `rx` = the smaller of R and 4; fill `surface`, stroke `border`. Checked: fill and stroke `primary`, with the `check` icon at 16 px in `on-primary`. |
| Radio | A field label as for `input` when there is one, then one option per item, stacked with no gap. The mark is a `circle` of radius 8, fill `surface`, stroke `border`; the selected option (`value`) adds a `circle` of radius 4 in `primary`. |
| Toggle | A track 36 × 20 with `rx` 10 and a knob, a `circle` of radius 8. Off: track fill `bg`, stroke `border`; knob 10 px from the track's left edge, fill `surface`, stroke `border`. On: track fill and stroke `primary`; knob 26 px from the track's left edge, fill `on-primary`, no stroke. |

### C.6 Navigation

| Component | Geometry |
| --- | --- |
| `nav` (horizontal) | A row 9u tall, entries 6u apart. Each entry: an optional 16 px icon and a 2u gap, then its text (15, line height 22). Inactive: weight 400, colour `text`. Active: weight 600, with a `rect` 2 px tall under the entry's text at the bottom of the row, fill `primary`. |
| `nav vertical` | A column of entries, each 9u tall and full width, with no gap. Text starts 3u from the left. Active: a `rect` behind the entry with `rx` = R, fill `bg`, and weight 600. |
| `tabs` | A strip 10u tall with a `line` along its bottom edge, `stroke` = `border`. Each tab is its text width plus 8u, with its text centred (15, line height 22). Inactive: weight 400, `muted`. Active: weight 600, `text`, and a `rect` 2 px tall across the tab at the strip's bottom, fill `primary`. Below the strip, a 4u gap, then the children as a column: gap `md`, align `stretch`. |
| `breadcrumbs` | A row 6u tall. Entries are 15, line height 22, `muted`, weight 400; the last is `text`, weight 500. Between entries, the `chevron-right` icon at 16 px in `muted`, with 1u on each side. |

### C.7 Content

| Component | Geometry |
| --- | --- |
| `list` (from a list) | One entry per item, each 9u tall, with no gap. Text is 15, weight 400, starting 5u from the left. Unordered: a `circle` of radius 2.5, fill `text`, centred 2u from the left. `ordered`: the number and a full stop (`1.`) in `muted`, starting at the left. |
| `list` (with `item` children) | The items, stacked with no gap and no markers. `ordered` has no effect. |
| `item` | 9u tall, padding 3u left and right. An optional 16 px icon and a 2u gap, then the label (15, weight 400). `active`: a `rect` behind it with `rx` = R, fill `bg`, and weight 600. `badge="…"`: a badge (below) at the right, inside the padding. |
| `card` | An outlined box with fill `surface`. Padding 4u. With a title: the title (15, weight 600, line height 22), then a gap of `md`. Then the children as a column: gap `md`, align `stretch`. |
| `table` | An optional caption (15, weight 600, line height 22) and a 2u gap, then an outlined box with fill `surface`, whose contents are clipped to it (a `clipPath`). The header row is 10u tall with fill `bg`; each further row is 10u tall, with a `line` between rows in `border`. Columns share the width equally. Cells have 3u padding left and right; header text is 14, weight 600; cell text is 14, weight 400; both truncate. A `selected` row has fill `bg` and a `rect` 3 px wide at its left edge in `primary`. Placeholder rows (`rows=N`, or 3 when a table has neither child rows nor `rows`) put a placeholder bar 60% of the cell's inner width in each cell. Intrinsic width: 120 per column; minimum: 64 per column. |
| `image` | An outlined box with fill `bg`, and two `line`s from corner to corner in `border`, width S. The description is centred on one line (13, weight 400, `muted`), truncated to the box width minus 4u, on a `rect` of fill `bg` that is 2u wider than the text and 18 px tall. |
| `icon` | 16, 20 or 24 px (`sm`, default, `lg`), in `text` |
| `badge` | 20 px tall, padding 2u left and right, `rx` 10. Text: 13, weight 500, centred. Default: fill `bg`, stroke `border`, text `text`. `primary`, `success`, `danger`: fill in that colour, no stroke, text `on-primary`. |
| `avatar` | A `circle` 24, 32 or 48 px across (`sm`, default, `lg`), fill `bg`, stroke `border`. The initials are centred: 10, 13 or 18 px, weight 600, in `text`. |

### C.8 States and overlays

| Component | Geometry |
| --- | --- |
| `empty` | Padding 8u top and bottom. Centred: the `inbox` icon at 32 px in `muted`, a 2u gap, the message (15, weight 400, `muted`, centred lines), then, if there are children, a 4u gap and the children as a column: gap `md`, align `center`. |
| `loading` | Padding 8u top and bottom. Centred: a spinner 24 px across (a `circle` of radius 12 in `border` with a `path` over its top-right quarter in `primary`, both width S, no fill), then, if there is a message, a 2u gap and the message as for `empty`. |
| `error` | As `empty`, with the `triangle-alert` icon in `danger`, and the message in `text` |
| `modal` | An outlined box with fill `surface`, 480 px wide by default (or its `width`), and no wider than the frame minus 8u. Padding 6u. A title row 24 px tall: the title (18, weight 600, line height 24) and the `x` icon at 20 px in `muted` at the right. Then a 4u gap and the children as a column: gap `md`, align `stretch`. |
| `drawer` | Fill `surface`, with a `line` along its inner edge in `border`. Left or right: 360 px wide (or its `width`), the full height of the frame. `bottom`: the full width of the frame, 50% of the device height tall. Padding, title row and children as for `modal`. |
| Dim layer | Under an open overlay, a `rect` the size of the frame with `rx` = R, fill `text` and `fill-opacity="0.4"` |

### C.9 The overview

| Part | Geometry |
| --- | --- |
| Canvas | A `rect` covering the whole canvas, fill `bg`, drawn first |
| Screen title | 15, weight 600, line height 24, `text`, starting at the frame's left edge, with its line box ending 8 px above the frame; truncated to the frame's width |
| Notes list | As wide as the frame or 240 px, whichever is wider, starting 24 px below the frame, level with its left edge. A heading `Notes` (13, weight 600, line height 18, `muted`), a 2u gap, then each note: its marker, and its text from 24 px further right (13, weight 400, line height 18, wrapping to the list's width less 24 px), with 2u between notes |
| Note marker | A `circle` of radius 9, fill `primary`, centred on the target's top-right corner; its number centred in it (12, weight 600, `on-primary`) |
| Arrow | A `path` of straight segments, `stroke` = `muted`, width S, no fill, `stroke-linejoin="round"`, ending in the marker below |
| Arrowhead | A `marker` in `defs` with the id `<idPrefix>-arrow`: `markerWidth` 8, `markerHeight` 8, `refX` 7, `refY` 4, `orient="auto"`, `markerUnits="userSpaceOnUse"`, holding a `path` `M0 0L8 4L0 8Z` with fill `muted` |
| Arrow label | Centred on the point halfway along the path: a `rect` 18 px tall, 2u wider than the text, `rx` 3, fill `bg`, and the label (13, weight 500, `text`) |

### C.10 The theme specimen

The frame is 1280 px wide. Its body starts with the colour block, followed by a gap of `md` and the elements of the fixed source in section 9.6.

The colour block is a grid of three columns, gap `md`. Each swatch is a `rect` 40 × 24, with `rx` = R, filled with the token's colour and stroked with `border`. To its right, after a 2u gap, are the token's name (13, weight 500, line height 18, `text`) and its value as written in the output (13, weight 400, line height 18, `muted`). Each swatch cell is 36 px tall.

## Appendix D. SVG elements and attributes

Each element carries only these attributes, in this order, and leaves out any it doesn't need.

| Element | Attributes, in order |
| --- | --- |
| `svg` | `xmlns`, `width`, `height`, `viewBox`, `role`, `aria-labelledby`, `xml:space` |
| `title`, `desc` | `id` (only the root's) |
| `metadata` | none |
| `wl:source` | `xmlns:wl`, `version` |
| `defs` | none |
| `clipPath` | `id` |
| `marker` | `id`, `markerWidth`, `markerHeight`, `refX`, `refY`, `orient`, `markerUnits` |
| `g` | `id`, `class`, `transform`, `clip-path`, `fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `aria-hidden` |
| `rect` | `x`, `y`, `width`, `height`, `rx`, `ry`, `fill`, `fill-opacity`, `stroke`, `stroke-width` |
| `circle` | `cx`, `cy`, `r`, `fill`, `stroke`, `stroke-width` |
| `line` | `x1`, `y1`, `x2`, `y2`, `stroke`, `stroke-width` |
| `path` | `d`, `fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `marker-end` |
| `text` | `x`, `y`, `font-family`, `font-size`, `font-weight`, `fill` |
| `tspan` | `fill` |
| `a` (interactive mode only) | `href` |

`clip-path` and `marker-end` take `url(#…)` with an id in the same document; no other URL appears anywhere. `class` lists `wl-<component>` first, then a class for each state flag in the order the flags were written.

## Appendix E. Open design questions for 0.1

1. **Fields without a label.** Settled for 0.1: a field with no label and no placeholder is valid and draws an empty box, without a warning.
2. **Interactive mode.** It is optional in 0.1. Should a conforming renderer be required to support it by 1.0?
3. **Right-to-left text** is out of 0.1. It needs metrics and layout rules before it can be added.
4. **Layering.** 0.1 has no container that draws children on top of each other. Add one only if real sources need it.
5. **A `selected` flag on `card`,** for a highlighted plan or a chosen file. Authors currently use a `badge`.
