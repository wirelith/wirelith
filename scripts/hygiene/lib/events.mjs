// SPDX-License-Identifier: MIT

// Reads user-written text out of GitHub events and API objects, for the post scanner.

/**
 * A piece of user-written text on GitHub, and where it lives.
 * @typedef {object} Post
 * @property {string} kind  for example "issue", "comment" or "review comment"
 * @property {string} url   the post's public link
 * @property {{ name: string, text: string }[]} fields
 */

/**
 * Picks the user-written fields out of an issue, discussion or comment event payload.
 * @param {any} event
 * @returns {Post | null}
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

/**
 * Pull request review comments (the inline notes on a diff), as returned by the API.
 * @param {any[]} comments
 * @returns {Post[]}
 */
export function reviewCommentPosts(comments) {
  return comments.map((c) => ({
    kind: 'review comment',
    url: String(c.html_url ?? ''),
    fields: [{ name: 'comment', text: String(c.body ?? '') }],
  }));
}

/**
 * Pull request reviews (the summary written when a review is submitted), as returned by the API.
 * Reviews with no text are skipped.
 * @param {any[]} reviews
 * @returns {Post[]}
 */
export function reviewPosts(reviews) {
  return reviews
    .filter((r) => typeof r.body === 'string' && r.body.trim() !== '')
    .map((r) => ({
      kind: 'review',
      url: String(r.html_url ?? ''),
      fields: [{ name: 'review', text: String(r.body) }],
    }));
}

/**
 * Where the denylist matches in a post, as "field, line N" strings. Never the matched text.
 * @param {{ lines: (text: string) => number[] }} list
 * @param {Post} post
 * @returns {string[]}
 */
export function matchPlaces(list, post) {
  const places = [];
  for (const f of post.fields) {
    for (const line of list.lines(f.text)) places.push(`${f.name}, line ${line}`);
  }
  return places;
}

/**
 * True when an open draft advisory already reports this post, so it isn't reported twice.
 * @param {any[]} drafts draft advisories, as returned by the API
 * @param {string} url
 */
export function alreadyReported(drafts, url) {
  return url !== '' && drafts.some((a) => String(a.description ?? '').includes(`Where: ${url}\n`));
}

/**
 * The text of the private notice. It names the place and never the term.
 * @param {Post} post
 * @param {string[]} places
 */
export function noticeText(post, places) {
  return [
    `A ${post.kind} contains a term from the private denylist.`,
    '',
    `Where: ${post.url}`,
    `Field and line: ${places.join('; ')}`,
    '',
    'Review it, edit or hide it if needed, then close this draft. This draft is visible only to maintainers.',
  ].join('\n');
}
