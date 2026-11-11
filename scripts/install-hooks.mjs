// SPDX-License-Identifier: MIT
// Points git at the repository's hooks in .githooks. Does nothing outside a git checkout.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync('.git')) {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks']);
}
