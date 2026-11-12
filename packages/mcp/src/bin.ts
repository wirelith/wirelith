#!/usr/bin/env node
// SPDX-License-Identifier: MIT

// Runs the Wirelith MCP server over standard input and output: one JSON-RPC message per line.
// Diagnostics about the server itself go to standard error. It opens no network connection.

import { createInterface } from 'node:readline';
import { createServer, MAX_MESSAGE } from './server.js';

const server = createServer();
const lines = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY });
let queue = Promise.resolve();

lines.on('line', (line) => {
  // Handle messages in order, one at a time.
  queue = queue.then(async () => {
    const out = await server.handle(line.length > MAX_MESSAGE ? line.slice(0, MAX_MESSAGE + 1) : line);
    if (out !== undefined) process.stdout.write(`${out}\n`);
  });
});
lines.on('close', () => {
  void queue.then(() => process.exit(0));
});
