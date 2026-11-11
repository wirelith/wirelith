// SPDX-License-Identifier: MIT

// Commit identity rules: every author and committer email is a GitHub noreply address, and
// every commit is signed off (DCO) by its author.

const NOREPLY = /^(?:\d+\+)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?@users\.noreply\.github\.com$/i;

/** GitHub's own committer address, used for commits it creates and signs, such as merges. */
export const GITHUB_WEB_COMMITTER = 'noreply@github.com';

/** @param {string} email */
export function isNoreply(email) {
  return NOREPLY.test(email.trim());
}

/**
 * Returns the emails in the commit message's Signed-off-by trailers.
 * @param {string} message
 * @returns {string[]}
 */
export function signOffEmails(message) {
  const out = [];
  for (const m of message.matchAll(/^Signed-off-by: .+ <([^<>\s]+)>\s*$/gm)) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

/**
 * @typedef {object} CommitInfo
 * @property {string} sha
 * @property {string} message
 * @property {string} authorEmail
 * @property {string} committerEmail
 * @property {boolean} [signedByGitHub] true when GitHub verified the signature and GitHub made it
 */

/**
 * Returns the problems with one commit, as plain sentences. An empty list means it passes.
 * @param {CommitInfo} c
 * @returns {string[]}
 */
export function commitProblems(c) {
  const problems = [];
  if (!isNoreply(c.authorEmail)) {
    problems.push('the author email is not a GitHub noreply address');
  }
  const committerOk =
    isNoreply(c.committerEmail) || (c.committerEmail === GITHUB_WEB_COMMITTER && c.signedByGitHub === true);
  if (!committerOk) {
    problems.push('the committer email is not a GitHub noreply address');
  }
  const signOffs = signOffEmails(c.message);
  if (signOffs.length === 0) {
    problems.push('there is no Signed-off-by line (use git commit -s)');
  } else if (!signOffs.some((e) => e.toLowerCase() === c.authorEmail.toLowerCase())) {
    problems.push('no Signed-off-by line matches the author email');
  }
  return problems;
}
