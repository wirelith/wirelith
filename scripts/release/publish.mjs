// SPDX-License-Identifier: MIT

// Publishes the npm packages whose version isn't on npm yet. The Publish workflow
// (.github/workflows/publish.yml) runs it from main; see RELEASING.md.
//
//   node scripts/release/publish.mjs             a dry run: shows what would be published
//   node scripts/release/publish.mjs --publish   publishes it
//
// Packages go in dependency order. A package whose version is already on npm is skipped, so a
// run that stopped part way can be run again. While a package is published, its `workspace:`
// dependencies are replaced by the versions of the packages they name; package.json is put back
// afterwards.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The published packages' folders under packages/, each after the ones it depends on. */
export const ORDER = ['core', 'png', 'cli', 'mcp'];

/** The oldest npm that can publish with trusted publishing. */
export const MIN_NPM = [11, 5, 1];

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

/**
 * A copy of a package.json with every `workspace:` range replaced by a real one: `workspace:*`
 * by the exact version, `workspace:^` and `workspace:~` by `^` or `~` and the version, and
 * `workspace:<range>` by the range.
 * @param {Record<string, any>} pkg
 * @param {Map<string, string>} versions package name to version
 * @returns {Record<string, any>}
 */
export function pinWorkspaceDeps(pkg, versions) {
  const out = structuredClone(pkg);
  for (const field of DEP_FIELDS) {
    const deps = out[field];
    if (!deps) continue;
    for (const [name, range] of Object.entries(deps)) {
      if (typeof range !== 'string' || !range.startsWith('workspace:')) continue;
      const version = versions.get(name);
      if (version === undefined) {
        throw new Error(`${pkg.name}: ${name} is a workspace dependency but not a published package`);
      }
      const rest = range.slice('workspace:'.length);
      deps[name] = rest === '*' ? version : rest === '^' || rest === '~' ? `${rest}${version}` : rest;
    }
  }
  return out;
}

/**
 * Whether a version is at least another, comparing MAJOR.MINOR.PATCH.
 * @param {string} version
 * @param {number[]} min
 */
export function atLeast(version, min) {
  const v = version
    .trim()
    .split('.')
    .map((p) => Number.parseInt(p, 10));
  for (let i = 0; i < min.length; i++) {
    const a = v[i] ?? 0;
    const b = min[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

/**
 * Runs npm and returns its result.
 * @param {string[]} args
 * @param {string} [cwd]
 */
function npm(args, cwd = repo) {
  return spawnSync('npm', args, { cwd, encoding: 'utf8' });
}

/**
 * Whether npm already has this version of a package.
 * @param {string} name
 * @param {string} version
 */
function onNpm(name, version) {
  const r = npm(['view', `${name}@${version}`, 'version']);
  if (r.status === 0) return r.stdout.trim() === version;
  if (/E404|404 Not Found/.test(r.stderr)) return false;
  throw new Error(`could not ask npm about ${name}@${version}:\n${r.stderr}`);
}

function main() {
  const publish = process.argv.includes('--publish');
  const npmVersion = npm(['--version']).stdout ?? '';
  if (!atLeast(npmVersion, MIN_NPM)) {
    throw new Error(`npm ${npmVersion.trim()} is too old to publish; it needs ${MIN_NPM.join('.')} or newer`);
  }
  const packages = ORDER.map((dir) => {
    const folder = join(repo, 'packages', dir);
    const file = join(folder, 'package.json');
    return { folder, file, json: JSON.parse(readFileSync(file, 'utf8')) };
  });
  const versions = new Map(packages.map((p) => [p.json.name, p.json.version]));
  console.log(publish ? 'Publishing.' : 'Dry run: nothing is published.');
  for (const p of packages) {
    const { name, version } = p.json;
    if (onNpm(name, version)) {
      console.log(`${name}@${version}: already on npm, skipped`);
      continue;
    }
    const original = readFileSync(p.file, 'utf8');
    writeFileSync(p.file, `${JSON.stringify(pinWorkspaceDeps(p.json, versions), null, 2)}\n`);
    try {
      const args = ['publish', '--access', 'public', ...(publish ? ['--provenance'] : ['--dry-run'])];
      const r = spawnSync('npm', args, { cwd: p.folder, stdio: 'inherit' });
      if (r.status !== 0) throw new Error(`${name}@${version}: npm publish failed`);
      console.log(`${name}@${version}: ${publish ? 'published' : 'would be published'}`);
    } finally {
      writeFileSync(p.file, original);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
