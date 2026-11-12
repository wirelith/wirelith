// SPDX-License-Identifier: MIT

// Lints the GitHub Actions workflows:
//
// - every `uses:` of another repository's action is pinned to a full 40-character commit SHA;
// - every container image (`docker://`, a job's container or services, `docker run`, `docker pull`
//   or `docker create` in a script) is pinned by digest, written in place or in an env variable;
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
const DIGEST = /@sha256:[0-9a-f]{64}\b/;
const DOCKER_COMMAND = /\bdocker\s+(?:run|pull|create)\b/;

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
    const image = typeof job?.container === 'string' ? job.container : job?.container?.image;
    if (typeof image === 'string' && !DIGEST.test(image)) {
      problems.push(`${file}: job ${jobName}: pin the container image by digest`);
    }
    for (const [name, service] of Object.entries(job?.services ?? {})) {
      const img = typeof service === 'string' ? service : service?.image;
      if (typeof img === 'string' && !DIGEST.test(img)) {
        problems.push(`${file}: job ${jobName}: pin the image of service ${name} by digest`);
      }
    }
    for (const [i, step] of (job?.steps ?? []).entries()) {
      const where = `${file}: job ${jobName}, step ${i + 1}`;
      if (typeof step?.run === 'string') {
        const env = { ...(wf.env ?? {}), ...(job?.env ?? {}), ...(step.env ?? {}) };
        checkDockerCommands(step.run, env, where, problems);
      }
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

/**
 * Every `docker run`, `docker pull` or `docker create` in a script must name an image pinned by
 * digest, either in place or through an env variable whose value is pinned.
 *
 * @param {string} script
 * @param {Record<string, unknown>} env
 * @param {string} where
 * @param {string[]} problems
 */
function checkDockerCommands(script, env, where, problems) {
  const commands = script.replace(/\\\r?\n/g, ' ').split(/\r?\n|;|&&|\|\|/);
  for (const command of commands) {
    if (!DOCKER_COMMAND.test(command)) continue;
    if (DIGEST.test(command)) continue;
    const vars = [...command.matchAll(/\$\{\{\s*env\.(\w+)\s*\}\}|\$\{?(\w+)\}?/g)].map((m) => m[1] ?? m[2]);
    if (vars.some((v) => v !== undefined && DIGEST.test(String(env[v] ?? '')))) continue;
    problems.push(`${where}: pin the image of "${command.trim().slice(0, 60)}" by digest`);
  }
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
  console.log('actions: all workflows pinned by SHA or digest, with explicit permissions.');
}
