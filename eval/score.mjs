#!/usr/bin/env node
// SPDX-License-Identifier: MIT

// Scores a model's answer to one eval task set.
//
//   node eval/score.mjs --set a answer.md          a table for people
//   node eval/score.mjs --set a answer.md --json   the same, as JSON
//
// The answer is the model's whole reply: five ```wirelith blocks, in task order. For each block
// the scorer reports whether it validates with no errors (using @wirelith/core), how many
// warnings it has, and which of the task's requirements it meets. A missing block scores zero.
// It makes no network requests and calls no model.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, validate } from '@wirelith/core';
import { REQUIREMENTS } from './requirements.mjs';

/** The wirelith fences of a markdown answer, in order. @param {string} md */
export function blocks(md) {
  const out = [];
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^ {0,3}(`{3,}|~{3,})\s*wirelith\b/.exec(lines[i] ?? '');
    if (!m) continue;
    const fence = m[1] ?? '```';
    const body = [];
    for (i++; i < lines.length; i++) {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(lines[i] ?? '');
      if (close && (close[1] ?? '')[0] === fence[0] && (close[1] ?? '').length >= fence.length) break;
      body.push(lines[i]);
    }
    out.push(`${body.join('\n')}\n`);
  }
  return out;
}

/**
 * Scores an answer.
 * @param {string} answer the model's reply
 * @param {'a' | 'b'} set
 */
export function score(answer, set) {
  const found = blocks(answer);
  const tasks = [1, 2, 3, 4, 5].map((n, i) => {
    const id = `${set.toUpperCase()}${n}`;
    const reqs = REQUIREMENTS[id] ?? [];
    const source = found[i];
    if (source === undefined) {
      return {
        task: id,
        present: false,
        valid: false,
        errors: 0,
        warnings: 0,
        met: [],
        missed: reqs.map(([d]) => d),
        codes: [],
      };
    }
    const ds = validate(source);
    const errors = ds.filter((d) => d.severity === 'error').length;
    const tree = parse(source).tree;
    /** @type {string[]} */
    const met = [];
    /** @type {string[]} */
    const missed = [];
    for (const [description, check] of reqs) {
      let ok = false;
      try {
        ok = errors === 0 && check(tree);
      } catch {
        ok = false;
      }
      (ok ? met : missed).push(description);
    }
    return {
      task: id,
      present: true,
      valid: errors === 0,
      errors,
      warnings: ds.length - errors,
      met,
      missed,
      codes: [...new Set(ds.map((d) => d.code))],
    };
  });
  const requirements = tasks.reduce((n, t) => n + t.met.length + t.missed.length, 0);
  return {
    set,
    blocks: found.length,
    valid: tasks.filter((t) => t.valid).length,
    requirementsMet: tasks.reduce((n, t) => n + t.met.length, 0),
    requirements,
    warnings: tasks.reduce((n, t) => n + t.warnings, 0),
    tasks,
  };
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const setIndex = args.indexOf('--set');
  const set = setIndex >= 0 ? args[setIndex + 1] : undefined;
  const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--set');
  if ((set !== 'a' && set !== 'b') || !file) {
    console.error('usage: node eval/score.mjs --set a|b <answer.md> [--json]');
    process.exit(2);
  }
  const result = score(readFileSync(file, 'utf8'), set);
  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `Set ${set.toUpperCase()}: ${result.valid}/5 valid, ${result.requirementsMet}/${result.requirements} requirements met, ${result.warnings} warnings (${result.blocks} blocks found)\n`,
    );
    console.log('| Task | Valid | Warnings | Requirements | Missed |');
    console.log('| --- | --- | --- | --- | --- |');
    for (const t of result.tasks) {
      const valid = !t.present ? 'missing' : t.valid ? 'yes' : `no (${t.codes.join(', ')})`;
      console.log(
        `| ${t.task} | ${valid} | ${t.warnings} | ${t.met.length}/${t.met.length + t.missed.length} | ${t.missed.join('; ')} |`,
      );
    }
  }
}
