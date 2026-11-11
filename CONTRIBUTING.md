# Contributing to Wirelith

Thank you for helping. Please read this whole page before you open a pull request.

## The ground rules

These three rules apply to everything in this project: files, commit messages, branch names, pull request titles and descriptions, issues, code comments, test data, examples and CI logs. Checks enforce what they can; the rest depends on you.

### 1. Everything here is public, forever

- This repository is public, and its whole history is public: commits, issues, pull requests, CI logs, branch names and author emails. Nothing can be cleaned up later, so never write something you would not want everyone to read.
- The copyright holder's name appears in exactly two files, `LICENSE` and `NOTICE`, and nowhere else. Not in package fields, docs, examples, comments or commit messages. A check fails if it appears anywhere else.
- Nothing here may be specific to any real organisation: no client or customer names, no real people, and no internal projects, products, URLs or documents.
- Examples, fixtures and tests use made-up products and made-up people. Reuse the invented names already in the specification, or invent new ones. If you are not sure a name is made up, pick another.
- Don't name other diagramming, charting or wireframing products, formats or services, for comparison, for credit, or for any other reason. Don't describe Wirelith as a version of another tool.
- Name a third party only where it is the thing being integrated with or depended on, and state it as a plain fact: for example Node, npm, the Model Context Protocol, or a font's or icon set's name and license.

### 2. Independent and interoperable

- The language and every package work with no account, no service and no particular host application. Anyone can write Wirelith in any markdown file, render it in any app, export SVG and PNG, and use it from any MCP client or AI agent.
- No package makes a network request at runtime. `@wirelith/core` has no runtime dependencies and uses no DOM.
- There are no private hooks, no host-specific syntax and no host-specific behaviour. If a feature only makes sense for one application, it doesn't belong here.
- `INTEGRATIONS.md` lists only integrations that exist.

### 3. These rules bind everyone

- Before you push, check your diff, your commit messages and your branch name against these rules.
- Pull requests are checked automatically. Please don't try to work around a check. If you think a check is wrong, open an issue.

The project also keeps a private list of terms that must never appear here. CI checks every pull request against it and reports only a file and line number. If it flags your pull request, rewrite that place, and don't mention what you removed anywhere.

## Commits

Every commit must:

1. **Use a GitHub noreply email** as its author and committer. Find yours under GitHub, Settings, Emails ("Keep my email addresses private"). It looks like `12345+yourname@users.noreply.github.com`. Set it for this repository:

   ```sh
   git config user.email "12345+yourname@users.noreply.github.com"
   ```

2. **Be signed off** under the [Developer Certificate of Origin](https://developercertificate.org/) (DCO). Signing off means you certify that you wrote the change, or otherwise have the right to submit it under this project's license. Add the sign-off with `-s`:

   ```sh
   git commit -s -m "Explain what changed"
   ```

   This adds a line `Signed-off-by: Your Name <your noreply email>`, which must match the commit's author. There is no contributor license agreement.

3. **Be signed**, by GPG or SSH key, if you have push access to this repository. The main branch only accepts signed commits.

The hooks in `.githooks` check the first two for you; `pnpm install` turns them on.

To fix commits that fail the check, amend them and force-push your branch:

```sh
git commit --amend -s --reset-author --no-edit             # the last commit
git rebase --signoff --exec 'git commit --amend --reset-author --no-edit' main   # every commit
```

## Development

You need Node 22.13 or newer and pnpm 11. With Node's bundled corepack, `corepack enable` provides the right pnpm; otherwise install `pnpm@11.28.9` with npm.

```sh
pnpm install          # also turns on the git hooks
pnpm lint             # formatting, lint, and the GitHub Actions lint
pnpm typecheck
pnpm test
pnpm build
pnpm size             # @wirelith/core: no dependencies, no imports, within its size budget
pnpm run check-licenses   # every dependency has an allowed license
pnpm hygiene          # the copyright-holder check, and the denylist if you have it
```

### Dependencies

- `@wirelith/core` has no dependencies, and must stay that way.
- Every new dependency needs a clear, permissive license and must have been released at least 14 days ago. pnpm enforces the age rule, and `pnpm run check-licenses` checks the license.
- Versions are exact. No ranges.
- Nothing may make a network request at runtime, and nothing may use a headless browser.

### Source files

Every source file starts with a `SPDX-License-Identifier: MIT` comment, and no other license header.

## Changing the language

The language is defined by `spec/`. A change to what sources mean (a component, flag, attribute, rule, diagnostic or rendering detail) needs an accepted RFC first. See [rfcs/README.md](rfcs/README.md).

When the RFC is accepted, one pull request updates the specification, the one-page AI specification and the conformance cases together.

## Pull requests

- Keep each pull request to one change.
- Fill in the template. Say what changed, what you deliberately left out, and how you tested it.
- Tick every box in the checklist once it is true. A check fails while any box is unticked.
- If you change a published package, add a changeset with `pnpm changeset`.
- Maintainers merge by squashing.
