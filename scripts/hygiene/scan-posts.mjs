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
// can read and write repository security advisories, and nothing else). The scheduled sweep
// also needs GITHUB_TOKEN, the workflow's own token, with read access to pull requests. Every run first checks that the token
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
import { API, ghGet, ghList, readEvent } from './lib/github.mjs';

/**
 * A sweep starts this long before the previous successful sweep did, so sweeps overlap. It
 * doesn't rely on the hourly schedule: GitHub often runs scheduled workflows hours late, and a
 * fixed window would miss whatever was posted in the gap.
 */
const OVERLAP_MINUTES = 15;

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
 * Where this sweep starts: OVERLAP_MINUTES before the previous successful sweep started, or
 * null, meaning from the beginning, when there has been none.
 * @param {string} repo
 * @param {string} token the workflow's GITHUB_TOKEN
 * @returns {Promise<Date | null>}
 */
async function sweepStart(repo, token) {
  const res = await ghGet(`/repos/${repo}/actions/workflows/scan-posts.yml/runs?status=success&per_page=50`, {
    token,
  });
  const body =
    /** @type {{ workflow_runs?: { id: number, event: string, run_started_at?: string, created_at: string }[] }} */ (
      await res.json()
    );
  const current = process.env.GITHUB_RUN_ID ?? '';
  const previous = (body.workflow_runs ?? []).find(
    (r) => String(r.id) !== current && ['schedule', 'workflow_dispatch'].includes(r.event),
  );
  if (!previous) return null;
  return new Date(
    new Date(previous.run_started_at ?? previous.created_at).getTime() - OVERLAP_MINUTES * 60_000,
  );
}

/**
 * Pull request reviews and review comments created or updated since `since` (all of them when
 * it is null). These are read with the workflow's own read-only token, not the triage token,
 * which can touch only advisories.
 * @param {string} repo
 * @param {string} token the workflow's GITHUB_TOKEN
 * @param {Date | null} since
 * @returns {Promise<import('./lib/events.mjs').Post[]>}
 */
async function reviewPostsSince(repo, token, since) {
  const after = since ? `&since=${since.toISOString()}` : '';
  const comments = await ghList(`/repos/${repo}/pulls/comments?sort=updated&direction=desc${after}`, token);
  const posts = reviewCommentPosts(comments);
  const pulls = await ghList(`/repos/${repo}/pulls?state=all&sort=updated&direction=desc`, token);
  for (const pr of pulls) {
    if (since && new Date(pr.updated_at) < since) break;
    posts.push(...reviewPosts(await ghList(`/repos/${repo}/pulls/${pr.number}/reviews`, token)));
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
  const readToken = process.env.GITHUB_TOKEN;
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
  /** @type {(import('./lib/events.mjs').Post | null)[]} */
  let posts = [];
  if (scheduled) {
    // Listing reviews doesn't depend on any match, so a failure here can fail the run openly.
    if (!readToken) notConfigured('no workflow token');
    try {
      posts = await reviewPostsSince(repo, readToken, await sweepStart(repo, readToken));
    } catch {
      notConfigured('the workflow token cannot list workflow runs or pull request reviews');
    }
  } else {
    posts = [eventTexts(readEvent())];
  }

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
