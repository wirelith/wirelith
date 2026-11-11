// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { lintWorkflow } from '../lint-actions.mjs';

const SHA = 'a'.repeat(40);

/** @param {string} body */
const wf = (body) =>
  `name: t\non: pull_request\npermissions:\n  contents: read\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n${body}`;

describe('lintWorkflow', () => {
  it('accepts an action pinned to a full SHA', () => {
    expect(lintWorkflow('w.yml', wf(`      - uses: actions/checkout@${SHA} # v1\n`))).toEqual([]);
  });

  it('rejects a tag, a branch or a short SHA', () => {
    for (const ref of ['v4', 'main', 'abc1234']) {
      expect(lintWorkflow('w.yml', wf(`      - uses: actions/checkout@${ref}\n`))).toHaveLength(1);
    }
  });

  it('allows local actions', () => {
    expect(lintWorkflow('w.yml', wf('      - uses: ./.github/actions/x\n'))).toEqual([]);
  });

  it('requires top-level permissions', () => {
    const text = `on: push\njobs:\n  j:\n    runs-on: x\n    steps:\n      - run: echo\n`;
    expect(lintWorkflow('w.yml', text)).toEqual(['w.yml: set top-level "permissions"']);
  });

  it('rejects write-all anywhere', () => {
    const text = `on: push\npermissions: write-all\njobs:\n  j:\n    runs-on: x\n    steps:\n      - run: echo\n`;
    expect(lintWorkflow('w.yml', text)).toEqual(['w.yml: do not use "write-all"']);
  });

  it('rejects checking out the pull request in a pull_request_target workflow', () => {
    const text = [
      'on: pull_request_target',
      'permissions: {}',
      'jobs:',
      '  j:',
      '    runs-on: x',
      '    steps:',
      `      - uses: actions/checkout@${SHA}`,
      '        with:',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, written literally
      '          ref: ${{ github.event.pull_request.head.sha }}',
      '          persist-credentials: false',
      '',
    ].join('\n');
    expect(lintWorkflow('w.yml', text)).toEqual([
      'w.yml: job j, step 1: a pull_request_target workflow must not check out the pull request',
    ]);
  });

  it('requires persist-credentials: false on checkout in a pull_request_target workflow', () => {
    const text = `on: [pull_request_target]\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - uses: actions/checkout@${SHA}\n`;
    expect(lintWorkflow('w.yml', text)).toEqual(['w.yml: job j, step 1: set persist-credentials: false']);
  });

  it('requires the denylist environment on a job that reads a WIRELITH_ secret', () => {
    /** @param {string} envLine */
    const job = (envLine) =>
      [
        'on: push',
        'permissions: {}',
        'jobs:',
        '  j:',
        '    runs-on: x',
        envLine,
        '    steps:',
        '      - run: echo',
        '        env:',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, written literally
        '          L: ${{ secrets.WIRELITH_DENYLIST }}',
        '',
      ].join('\n');
    expect(lintWorkflow('w.yml', job('    environment: denylist'))).toEqual([]);
    expect(lintWorkflow('w.yml', job('    environment:\n      name: denylist'))).toEqual([]);
    expect(lintWorkflow('w.yml', job('    environment: other'))).toEqual([
      'w.yml: job j reads a WIRELITH_ secret, so it must set environment: denylist',
    ]);
    expect(lintWorkflow('w.yml', job('    timeout-minutes: 5'))).toEqual([
      'w.yml: job j reads a WIRELITH_ secret, so it must set environment: denylist',
    ]);
  });
});
