// SPDX-License-Identifier: MIT

// Reads the user-written text out of issue, discussion and comment events.

/**
 * Picks the user-written fields out of an event payload.
 * @param {any} event
 * @returns {{ kind: string, url: string, fields: { name: string, text: string }[] } | null}
 */
export function eventTexts(event) {
  if (event.comment) {
    return {
      kind: 'comment',
      url: String(event.comment.html_url ?? ''),
      fields: [{ name: 'comment', text: String(event.comment.body ?? '') }],
    };
  }
  const item = event.discussion ?? event.issue;
  if (!item) return null;
  return {
    kind: event.discussion ? 'discussion' : 'issue',
    url: String(item.html_url ?? ''),
    fields: [
      { name: 'title', text: String(item.title ?? '') },
      { name: 'body', text: String(item.body ?? '') },
    ],
  };
}
