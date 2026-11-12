// SPDX-License-Identifier: MIT

// Lints the GitHub Actions workflows:
//
// - every `uses:` of another repository's action is pinned to a full 40-character commit SHA;
// - every workflow sets top-level `permissions`, and nothing asks for write-all or read-all;
// - a workflow that runs on pull_request_target never checks out the pull request's code;
// - a job that reads a WIRELITH_ secret runs in the `denylist` environment, which only
//   workflows running from main can use.

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const DIR = '.github/workflows';
const PINNED = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+@[0-9a-f]{40}$/;
const PROTECTED_SECRET = /secrets\.WIRELITH_/;
const SECRETS_ENVIRONMENT = 'denylist';

/**
 * @param {string} file
 * @param {string} text
 * @returns {string[]}
 */
export function lintWorkflow(file, text) {
  const problems = [];
  const wf = parse(text);
  if (!wf || typeof wf !== 'object') return [`${file}: not a workflow`];

  if (!('permissions' in wf)) problems.push(`${file}: set top-level "permissions"`);
  const allPerms = [wf.permissions, ...Object.values(wf.jobs ?? {}).map((j) => j?.permissions)];
  for (const p of allPerms) {
    if (p === 'write-all' || p === 'read-all') problems.push(`${file}: do not use "${p}"`);
  }

  const on = wf.on ?? wf.true; // YAML 1.1 reads a bare "on" key as true
  const triggers = typeof on === 'string' ? [on] : Array.isArray(on) ? on : Object.keys(on ?? {});
  const isTarget = triggers.includes('pull_request_target');

  for (const [jobName, job] of Object.entries(wf.jobs ?? {})) {
    if (typeof job?.uses === 'string') checkUses(job.uses, `${file}: job ${jobName}`, problems);
    const env = typeof job?.environment === 'object' ? job?.environment?.name : job?.environment;
    if (PROTECTED_SECRET.test(JSON.stringify(job ?? {})) && env !== SECRETS_ENVIRONMENT) {
      problems.push(
        `${file}: job ${jobName} reads a WIRELITH_ secret, so it must set environment: ${SECRETS_ENVIRONMENT}`,
      );
    }
    for (const [i, step] of (job?.steps ?? []).entries()) {
      const where = `${file}: job ${jobName}, step ${i + 1}`;
      if (typeof step?.uses === 'string') {
        checkUses(step.uses, where, problems);
        if (isTarget && step.uses.startsWith('actions/checkout@')) {
          const ref = String(step.with?.ref ?? '');
          const repo = String(step.with?.repository ?? '');
          if (/head|merge|pull/i.test(ref) || repo.includes('head')) {
            problems.push(`${where}: a pull_request_target workflow must not check out the pull request`);
          }
          if (step.with?.['persist-credentials'] !== false) {
            problems.push(`${where}: set persist-credentials: false`);
          }
        }
      }
    }
  }
  return problems;
}

/**
 * @param {string} uses
 * @param {string} where
 * @param {string[]} problems
 */
function checkUses(uses, where, problems) {
  if (uses.startsWith('./')) return;
  if (uses.startsWith('docker://')) {
    if (!/@sha256:[0-9a-f]{64}$/.test(uses)) problems.push(`${where}: pin the image by digest`);
    return;
  }
  if (!PINNED.test(uses)) problems.push(`${where}: pin "${uses}" to a full commit SHA`);
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const problems = [];
  for (const f of readdirSync(DIR)
    .filter((n) => /\.ya?ml$/.test(n))
    .sort()) {
    problems.push(...lintWorkflow(join(DIR, f), readFileSync(join(DIR, f), 'utf8')));
  }
  if (problems.length > 0) {
    for (const p of problems) console.error(p);
    process.exit(1);
  }
  console.log('actions: all workflows pinned by SHA with explicit permissions.');
}
