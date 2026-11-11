# Wirelith in one page

Wirelith is a plain-text language for low-fidelity wireframes. Write it in a markdown code block whose language is `wirelith`.

## Example

```wirelith
wirelith 0.1

screen "Projects" desktop #projects
  header
    h2 "Projects"
    spacer
    input placeholder="Search" type=search width=240
    button "New project" primary #add -> #new
  tabs [Active, Archived] active="Active"
    table [Name, Owner, Updated]
      row [Website redesign, Ada Park, 2 days ago]
      row [Mobile app, Luis Ortega, Last week]
  modal "New project" #new
    input "Name" required
    select "Template" [Blank, Roadmap, Launch plan]
    row justify=end
      button "Cancel"
      button "Create" primary -> #detail
  note "Only admins see this button" for=#add

screen "Website redesign" desktop #detail
  breadcrumbs [Projects, Website redesign]
  h1 "Website redesign"
  empty "No tasks yet"
    button "Add a task" primary
```

## Rules

1. **One element per line:** a component name, then its parts in any order.
2. **Nest with exactly 2 spaces.** Never tabs.
3. **Parts:**
   - `"text"`: the label. Always in double quotes.
   - `[a, b, c]`: the items (options, tabs, columns, cells). Quote an item only if it contains a comma, a bracket or starts with `#`.
   - bare words: flags, such as `primary` or `disabled`.
   - `key=value`: attributes. Quote a value that contains spaces.
   - `#id`: names the element.
   - `-> #id`: links to a screen, modal or drawer. Always last on the line.
4. **Top level** holds only `screen`, `theme` and `flow`. Everything else goes inside a screen.
5. **Comments** start with `//`.
6. Use only the components, flags and attributes listed here. There is no HTML, no colours on elements, no real images and no URLs.

## Components

| Group | Components |
| --- | --- |
| Screen | `screen "Title"` with `phone`, `tablet`, `desktop` (default) or `size=WxH` |
| Layout | `row`, `column`, `grid cols=N`, `spacer`, `divider` |
| Regions | `header`, `footer`, `sidebar` (add `right`; goes directly inside a screen, or inside a `row` beside the main content), `nav [..]`, `tabs [..]`, `breadcrumbs [..]` |
| Text | `h1`, `h2`, `h3`, `text` (paragraph), `label` (caption) |
| Controls | `button`, `link`, `input`, `textarea`, `select "Label" [..]`, `checkbox`, `radio "Label" [..]`, `toggle` |
| Content | `table [columns]` with `row [cells]` children, `list [..]` or `list` with `item` children, `card "Title"`, `image "description"`, `icon "name"`, `badge`, `avatar "Full name"` |
| Overlays | `modal "Title"`, `drawer "Title"` (add `left`, `right` or `bottom`). Put them directly inside a screen and link to them. |
| States | `empty "message"`, `loading`, `error "message"` |
| Notes | `note "text" for=#id`, directly inside a screen |

## Flags and attributes

| On | Use |
| --- | --- |
| `button` | `primary`, `danger`, `disabled`, `sm`, `lg`, `icon=name` |
| `input` | `placeholder="…"`, `value="…"`, `type=` one of `text`, `password`, `email`, `number`, `search`, `date`, `required`, `disabled`, `error="…"` |
| `textarea` | `placeholder`, `value`, `rows=N` |
| `select`, `radio` | `value="…"` (the chosen option) |
| `checkbox` | `checked` |
| `toggle` | `on` |
| `nav`, `tabs` | `active="…"`; `nav` also takes `vertical` |
| `item` | `active`, `icon=name`, `badge="…"` |
| `text` | `muted`, `lines=N` for placeholder lines |
| `badge` | `primary`, `danger`, `success` |
| `table` | `rows=N` for placeholder rows |
| `image` | `ratio=16:9`, `width`, `height` |
| Containers | `gap` and `pad`: `none`, `xs`, `sm`, `md`, `lg` or `xl`. `align`: `start`, `center`, `end` or `stretch`. `justify`: `start`, `center`, `end` or `between`. |
| Anything | `width` and `height` = pixels, a percentage or `fill`; `grow` to take the remaining room |

## Flows and states

- Add `-> #id` to a button, link or item to show where it goes.
- `flow #a -> #b "label"` on its own line at the top level links two screens directly.
- For another state of a screen, write a second screen: `screen "Projects" #projects-empty of=#projects state="Empty"`.

## Themes

Optional, after the version line: `theme paper` (default), `theme ink` or `theme blueprint`.

## Icons

Icon names are from the Lucide set, in lowercase with hyphens: `search`, `menu`, `plus`, `x`, `user`, `settings`, `bell`, `arrow-left`, `chevron-right`, `download`, `trash`, `pencil`, `calendar`, `shopping-cart`, `check`, `filter`. There are no brand logos.

## Common mistakes

- Don't invent components (`textfield`, `dropdown`, `navbar`, `container`). Use `input`, `select`, `nav`, `column`.
- Don't put a colon after a component, or braces around children.
- Don't write `options=[..]`, `items=[..]` or `columns=[..]`. Write the list on its own: `select "Size" [S, M, L]`.
- Don't put `modal` or `drawer` inside a row or card. They go directly inside the screen.
- Every `-> #id` must point at an id that exists.
