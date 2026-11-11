# SVG normalisation

Before comparing an implementation's SVG with a case's `output.svg`, the runner normalises both. Normalisation removes only differences that don't change the document. The specification fixes everything else (section 12.2): element order, attribute order, number formatting, and the text itself.

The steps, in order:

1. Drop a byte-order mark, an XML declaration, a document type declaration, and comments.
2. Turn CRLF and lone CR line endings into LF.
3. Remove text that is only whitespace between tags, except inside `text`, `tspan`, `title`, `desc`, `wl:source` and `a`, where all text is kept exactly.
4. Write every attribute value in double quotes, with no whitespace around `=`, and one space before each attribute.
5. Write every element with no content as `<name/>`.
6. Decode every character reference and entity in text and attribute values, then write them again with the fewest escapes: `&amp;`, `&lt;` and `&gt;` in text, and also `&quot;` in attribute values.
7. Drop whitespace at the end of the document.

Normalisation never:

- reorders elements or attributes;
- changes a number, so `1.0` and `1` stay different;
- changes text inside text-bearing elements, so two spaces and one space stay different;
- changes ids or classes.

The reference implementation is `runner/normalise.mjs`.
