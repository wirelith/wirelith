// SPDX-License-Identifier: MIT

// Turns a unified diff patch into the lines it adds, with their line numbers in the new file.

/**
 * @param {string} patch the "patch" of one file, as the GitHub API returns it
 * @returns {{ line: number, text: string }[]}
 */
export function addedLines(patch) {
  const out = [];
  let newLine = 0;
  for (const raw of patch.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (raw.startsWith('+')) {
      out.push({ line: newLine, text: raw.slice(1) });
      newLine++;
    } else if (raw.startsWith(' ')) {
      newLine++;
    }
    // Lines starting with "-" and "\ No newline at end of file" do not advance the new file.
  }
  return out;
}

/**
 * Joins added lines into one text, keeping a map back to their line numbers. Consecutive added
 * lines stay adjacent, so a phrase broken across them can still be found.
 * @param {{ line: number, text: string }[]} added
 * @returns {{ text: string, lineAt: (n: number) => number }}
 */
export function joinAdded(added) {
  const text = added.map((a) => a.text).join('\n');
  return { text, lineAt: (n) => added[n - 1]?.line ?? 0 };
}
