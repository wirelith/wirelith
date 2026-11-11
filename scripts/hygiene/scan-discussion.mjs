// SPDX-License-Identifier: MIT

// Scans a new or edited issue, discussion or comment against the private denylist. It never
// comments, and its public log never says whether anything matched.
//
// On a match it tells the maintainers privately, by opening a draft repository security
// advisory, which only repository administrators and security managers can see. The draft
// names the place (a link, the field and the line number) and never the term.
//
// It needs WIRELITH_DENYLIST (the list) and WIRELITH_TRIAGE_TOKEN (a fine-grained token that can
// write repository security advisories). If either is missing the job fails on every run, so a
// broken setup is noticed without revealing anything about any match.

import { loadDenylist } from './lib/denylist.mjs';
import { eventTexts } from './lib/events.mjs';
import { readEvent } from './lib/github.mjs';

/**
 * @param {string} repo
 * @param {string} token
 * @param {string} description
 */
async function openDraftAdvisory(repo, token, description) {
  const res = await fetch(`https://api.github.com/repos/${repo}/security-advisories`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'wirelith-hygiene',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      summary: 'Content review: a new post may need editing',
      description,
      severity: 'low',
      vulnerabilities: [{ package: { ecosystem: 'other', name: 'repository content' } }],
    }),
  });
  if (!res.ok) throw new Error(`could not open the private notice (HTTP ${res.status})`);
}

async function main() {
  const list = loadDenylist(() => '', { WIRELITH_DENYLIST: process.env.WIRELITH_DENYLIST });
  const token = process.env.WIRELITH_TRIAGE_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!list || list.size === 0 || !token || !repo) {
    console.error('scan: this job is not configured. A maintainer needs to check its secrets.');
    process.exit(2);
  }

  const texts = eventTexts(readEvent());
  if (texts) {
    const places = [];
    for (const f of texts.fields) {
      for (const line of list.lines(f.text)) places.push(`${f.name}, line ${line}`);
    }
    if (places.length > 0) {
      const description = [
        `A ${texts.kind} contains a term from the private denylist.`,
        '',
        `Where: ${texts.url}`,
        `Field and line: ${places.join('; ')}`,
        '',
        'Review it, edit or hide it if needed, then close this draft. This draft is visible only to maintainers.',
      ].join('\n');
      await openDraftAdvisory(repo, token, description);
    }
  }
  console.log('scan: complete.');
}

await main();
