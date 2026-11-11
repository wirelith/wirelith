// SPDX-License-Identifier: MIT

// Scans user posts against the private denylist: new and edited issues, discussions and
// comments (one event at a time), and, on a schedule, recent pull request reviews and review
// comments. Workflows triggered by reviews on pull requests from forks get no secrets, so
// reviews are swept on a schedule instead.
//
// It never comments. Its public log and its result are the same whether or not anything
// matched. On a match it tells the maintainers privately, by opening a draft repository
// security advisory, which only repository administrators and security managers can see. The
// draft names the place (a link, the field and the line number) and never the term. A place
// that an open draft already reports is not reported again.
//
// It needs WIRELITH_DENYLIST (the list) and WIRELITH_TRIAGE_TOKEN (a fine-grained token that
// can read and write repository security advisories). Every run first checks that the token
// works, whether or not anything matched, so a broken setup fails every run, and a failure
// never reveals a match.

import { loadDenylist } from './lib/denylist.mjs';
import {
  alreadyReported,
  eventTexts,
  matchPlaces,
  noticeText,
  reviewCommentPosts,
  reviewPosts,
} from './lib/events.mjs';
import { API, ghList, readEvent } from './lib/github.mjs';

/** How far back a scheduled sweep looks. Longer than the schedule, so runs overlap. */
const SWEEP_MINUTES = 90;

/**
 * @param {string} repo
 * @param {string} token
 * @param {string} description
 */
async function openDraftAdvisory(repo, token, description) {
  const res = await fetch(`${API}/repos/${repo}/security-advisories`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'wirelith-hygiene',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      summary: 'Content review: a post may need editing',
      description,
      severity: 'low',
      vulnerabilities: [{ package: { ecosystem: 'other', name: 'repository content' } }],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/**
 * Pull request reviews and review comments created or updated recently.
 * @param {string} repo
 * @param {string} token
 * @returns {Promise<import('./lib/events.mjs').Post[]>}
 */
async function recentReviewPosts(repo, token) {
  const since = new Date(Date.now() - SWEEP_MINUTES * 60_000);
  const comments = await ghList(
    `/repos/${repo}/pulls/comments?sort=updated&direction=desc&since=${since.toISOString()}`,
    token,
    10,
  );
  const posts = reviewCommentPosts(comments);
  const pulls = await ghList(`/repos/${repo}/pulls?state=all&sort=updated&direction=desc`, token, 1);
  for (const pr of pulls) {
    if (new Date(pr.updated_at) < since) break;
    posts.push(...reviewPosts(await ghList(`/repos/${repo}/pulls/${pr.number}/reviews`, token, 3)));
  }
  return posts;
}

/**
 * @param {string} why
 * @returns {never}
 */
function notConfigured(why) {
  console.error(`scan: this job is not configured (${why}). A maintainer needs to check its secrets.`);
  process.exit(2);
}

async function main() {
  const list = loadDenylist(() => '', { WIRELITH_DENYLIST: process.env.WIRELITH_DENYLIST });
  const token = process.env.WIRELITH_TRIAGE_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!list || list.size === 0) notConfigured('no denylist');
  if (!token || !repo) notConfigured('no triage token');

  // Runs on every scan, match or not: proves the token works, and lists the open drafts.
  let drafts;
  try {
    drafts = await ghList(`/repos/${repo}/security-advisories?state=draft`, token, 5);
  } catch {
    notConfigured('the triage token cannot read security advisories');
  }

  const scheduled = ['schedule', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME ?? '');
  const posts = scheduled ? await recentReviewPosts(repo, token) : [eventTexts(readEvent())];

  for (const post of posts) {
    if (!post || !list) continue;
    const places = matchPlaces(list, post);
    if (places.length === 0 || alreadyReported(drafts, post.url)) continue;
    try {
      await openDraftAdvisory(repo, token, noticeText(post, places));
    } catch {
      // Deliberately silent: a failure here must look exactly like a run with no match.
    }
  }
  console.log('scan: complete.');
}

await main();
