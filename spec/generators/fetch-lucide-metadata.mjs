// SPDX-License-Identifier: MIT

// Writes spec/generators/lucide-metadata.json: the categories, aliases and deprecation notes
// of every icon the curated list draws, taken from the Lucide source repository at the commit
// pinned in inputs.lock.json. The icon generator uses it to refuse brand icons. Only these
// fields are kept.
//
//   node spec/generators/fetch-lucide-metadata.mjs               fetch through the GitHub API
//   node spec/generators/fetch-lucide-metadata.mjs --from <dir>  read a local checkout instead
//
// This script uses the network unless --from is given. It runs only when the pinned release
// or the curated list changes, never at build time or at runtime. Set GITHUB_TOKEN to raise
// the API rate limit.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkVersion, resolveNames, wantedNames } from './lib/lucide.mjs';

const lock = JSON.parse(readFileSync('spec/generators/inputs.lock.json', 'utf8'));
const { repository, commit, version } = lock.icons;
checkVersion(version);

const fromIndex = process.argv.indexOf('--from');
const fromDir = fromIndex > 0 ? process.argv[fromIndex + 1] : undefined;

/** @param {string} name */
async function iconJson(name) {
  if (fromDir) return JSON.parse(readFileSync(join(fromDir, 'icons', `${name}.json`), 'utf8'));
  /** @type {Record<string, string>} */
  const headers = { accept: 'application/vnd.github.raw+json', 'user-agent': 'wirelith-generator' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const url = `https://api.github.com/repos/${repository}/contents/icons/${name}.json?ref=${commit}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} for icons/${name}.json`);
  return res.json();
}

const canonical = [...new Set(resolveNames(wantedNames()).values())].sort();
/** @type {Record<string, unknown>} */
const icons = {};
for (const name of canonical) {
  const m = await iconJson(name);
  const aliases = (m.aliases ?? []).map((/** @type {any} */ a) => (typeof a === 'string' ? a : a.name));
  icons[name] = {
    categories: [...(m.categories ?? [])].sort(),
    aliases: aliases.sort(),
    ...(m.deprecated ? { deprecated: true } : {}),
    ...(m.deprecationReason ? { deprecationReason: String(m.deprecationReason) } : {}),
  };
}
writeFileSync(
  'spec/generators/lucide-metadata.json',
  `${JSON.stringify({ repository, commit, icons }, null, 2)}\n`,
);
console.log(`lucide metadata: ${canonical.length} icons written.`);
