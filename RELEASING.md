# Releasing

How a version of the specification is released, and how the packages are published. Only maintainers ([MAINTAINERS.md](MAINTAINERS.md)) release, and only from `main`.

There are two kinds of version, and they are independent (spec section 14):

- **Spec versions,** such as 0.1, are released by a tag of this repository.
- **Package versions,** such as `@wirelith/core` 0.1.0, follow the packages' own changes. Each package's README says which spec versions it implements.

## Releasing a spec version

A spec version is a draft until it is released. The release is the tag `spec-v<MAJOR>.<MINOR>`, and the specification, its data files and the conformance suite at that tag never change.

1. **Open a release pull request** that:
   - removes "(draft)" from the heading of `spec/spec.md`, and changes its status line to say the version is released;
   - lists the changes since the previous released version (section 14 asks each release to);
   - updates the status line in README.md.
2. **Merge it.**
3. **Tag the merge commit** and push the tag:

   ```sh
   git fetch origin
   git tag -s spec-v0.1 <merge commit> -m "Wirelith specification 0.1"
   git push origin spec-v0.1
   ```

After a release, the first accepted RFC that changes the language starts the next version, which is a draft until it is released in turn.

## Publishing the npm packages

The packages are `@wirelith/core`, `@wirelith/png`, `@wirelith/cli` and `@wirelith/mcp`.

### Versions

Every pull request that changes a published package adds a changeset (`pnpm changeset`). To release:

1. **Open a release pull request** made with `pnpm changeset version`. It bumps the versions and writes each package's CHANGELOG.md from the changesets. Check both, and update any README that names a spec version.
2. **Merge it.**

### Publish

Run the **Publish** workflow (`.github/workflows/publish.yml`) by hand: Actions, Publish, Run workflow, on `main`.

1. **Run it first with "publish" unticked.** That is a dry run. Its log lists each package and version it would publish, and the files in each.
2. **Run it again with "publish" ticked,** and approve the run in the `npm` environment.

It runs the checks again, then publishes, in dependency order, each package whose version isn't on npm yet. A package already on npm is skipped, so a run that stopped part way can be run again. Packages are published with provenance, which links each one to the commit and the workflow run that built it.

After publishing, check that each package's page on npm shows the version and its provenance, and that `npx @wirelith/cli --help` works.

## One-time setup

These are settings outside the files in this repository. A maintainer makes them once.

- **npm:** the `@wirelith` scope belongs to an npm organisation whose members are the maintainers, with two-factor authentication required.
- **The `npm` environment** in this repository's settings: deployments only from `main`, and required reviewers who are maintainers. Create it before the first run, because a workflow that names an environment that doesn't exist creates it with no protection.
- **A trusted publisher for each package** on npm: repository `wirelith/wirelith`, workflow `publish.yml`, environment `npm`. A new trusted publisher must be used within 2 days.
- **The first publish of a package.** npm sets up a trusted publisher on the package's settings page, so a package may have to exist first. If it does, publish the first version with a granular access token that can publish only the `@wirelith` packages and expires soon. Store it as the secret `NPM_TOKEN` in the `npm` environment, run the workflow, then add the trusted publishers, delete the secret and revoke the token.
- **A tag ruleset** that stops `spec-v*` tags from being moved or deleted.

## Python

The `wirelith` package on PyPI isn't published yet. It will be once the Python validator reports `E701` for the output canvas ([ROADMAP.md](ROADMAP.md)), so that it reports every diagnostic core does. Until then, use it from this repository.

## The first release

The first release is spec 0.1 and the npm packages at 0.1.0, in this order:

1. **Merge #41** (RFC 0008), not before 2026-11-29 14:14 UTC.
2. **Open one release pull request** for both:
   - the spec heading, status lines and README changes from "Releasing a spec version";
   - versions stay at 0.1.0: the pending changesets are deleted instead of applied, and each package gets a CHANGELOG.md with one entry, 0.1.0, saying it is the first release and implements spec 0.1.
3. **Merge it, and tag its merge commit `spec-v0.1`.**
4. **Publish:** a dry run, then for real. Use `NPM_TOKEN` if the packages need to exist before they can have trusted publishers.
5. **Finish the setup:** trusted publishers on, token revoked.
6. **Open a pull request with the install instructions** in README.md and in each package's README, in place of "not yet published". It comes after publishing, so the READMEs never point at packages that aren't there.
