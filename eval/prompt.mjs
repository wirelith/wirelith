#!/usr/bin/env node
// SPDX-License-Identifier: MIT

// Prints the exact prompt for one eval task set: the one-page AI spec, then the task set. Paste
// it into a model with no other context.
//
//   node eval/prompt.mjs --set a > prompt-a.md

import { readFileSync } from 'node:fs';
import { AI_SPEC } from '@wirelith/core/ai-spec';

const set = process.argv[process.argv.indexOf('--set') + 1];
if (set !== 'a' && set !== 'b') {
  console.error('usage: node eval/prompt.mjs --set a|b');
  process.exit(2);
}
const tasks = readFileSync(new URL('./tasks/tasks.md', import.meta.url), 'utf8');
const heading = set === 'a' ? '## Task set A' : '## Task set B';
const start = tasks.indexOf(heading);
const end = set === 'a' ? tasks.indexOf('## Task set B') : tasks.length;
if (start < 0 || end < 0) throw new Error('tasks.md is missing a task set');
const body = tasks.slice(start + heading.length, end).trim();
process.stdout.write(`${AI_SPEC.trimEnd()}\n\n---\n\n${body}\n`);
