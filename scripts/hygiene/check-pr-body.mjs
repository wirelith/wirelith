// SPDX-License-Identifier: MIT

// Fails a pull request unless every checkbox in the pull request template is ticked.

import { readEvent } from './lib/github.mjs';
import { untickedCheckboxes } from './lib/pr-template.mjs';

const event = readEvent();
const missing = untickedCheckboxes(event.pull_request?.body);
if (missing.length > 0) {
  console.error('PR checklist: these items are not ticked:');
  for (const m of missing) console.error(`  - ...${m}...`);
  console.error(
    'Tick each one in the description once it is true. Editing the description re-runs this check.',
  );
  process.exit(1);
}
console.log('PR checklist: all items ticked.');
