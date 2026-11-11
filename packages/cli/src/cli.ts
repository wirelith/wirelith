#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { main } from './main.js';

const io = {
  cwd: process.cwd(),
  readStdin: async () => {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString('utf8');
  },
  stdout: (chunk: string | Uint8Array) => {
    process.stdout.write(chunk);
  },
  stderr: (text: string) => {
    process.stderr.write(text);
  },
};

process.exitCode = await main(process.argv.slice(2), io);
