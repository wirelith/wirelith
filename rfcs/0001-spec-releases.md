# RFC 0000: Spec versions are drafts until released

- **Status:** draft
- **Spec version:** 0.1, and every version after it. This changes how versions work, not what any source means.

## Summary

A spec version is a draft until the maintainers release it, by tagging this repository `spec-v<MAJOR>.<MINOR>`. While it's a draft, accepted RFCs may change it in any way, including moving pixels in its conformance outputs. Once it's released, it never changes. A claim to be compatible with a version refers to a released version.

## Motivation

Section 14 says: "Any change to layout or metrics that moves a pixel in a conformance output is a new minor version." It never says when a version is released and stops changing. Two problems follow.

- **Every pixel change would burn a version.** Three rendering RFCs are open now: #13, #16 and #17. Under section 14 as written, accepting them makes 0.2, 0.3 and 0.4 in one week. Each would change the version in the spec, in core and in every example, and none of those versions would ever be used.
- **"Compatible with 0.1" means nothing fixed.** The conformance suite on the main branch changes whenever an RFC is accepted. An implementation that passed it last month may fail it today, under the same version number.

The specification's own heading already says "v0.1 (draft)". This RFC defines what that means.

## Design

**Section 14** gets a new rule after "Spec versions":

> **Drafts and releases.** A spec version is a draft until the maintainers release it. A release is a tag of this repository named `spec-v<MAJOR>.<MINOR>`, for example `spec-v0.1`. The specification, its data files and the conformance suite at that tag define the version, and never change. While a version is a draft, accepted RFCs may change it in any way, including changes that move a pixel in its conformance outputs. After a release, the first accepted RFC that changes the language starts the next version, which is a draft until it is released in turn. A mistake found in a released version is fixed in the next version.

and "Rendering changes" becomes:

> **Rendering changes.** Once a version is released, any change to layout or metrics that would move a pixel in its conformance outputs belongs to a later version.

**The specification's heading** says "(draft)" while the version is a draft. The release removes it and gives the tag.

**Claims of compatibility.** TRADEMARKS.md and conformance/README.md change from "passes the conformance suite for that version" to:

> passes the conformance suite at that version's release tag (for example `spec-v0.1`). A draft version can't be claimed.

**rfcs/README.md, step 4,** adds: an accepted RFC goes into the current draft version, or starts the next one if the latest version is released.

**Who releases.** The maintainers, as GOVERNANCE.md already says. The release tag should be protected, so it can't be moved or deleted. That is a repository setting, not part of the specification.

## Learnability

Nothing to learn. Sources are written exactly as before.

## Compatibility

No source changes meaning. No conformance output changes.

The open RFCs (#13, #16 and #17) go into 0.1, which is still a draft, and match section 14 once this is accepted. Nothing has been released yet, so no claim of compatibility is affected.

## Security

None.

## Alternatives

- **Treat a version as released once it's public.** Section 14 as written reads this way. Every accepted rendering change would then need a new minor version, as described under Motivation.
- **Release branches instead of tags.** A branch can move, and a released version must not.
- **Version by date.** Sources would declare a date instead of a version. That breaks the `wirelith MAJOR.MINOR` header and the rules for newer versions (`W101`, `E103`).

## Conformance

No cases change. After the release of 0.1, the conformance runner can be pointed at the `spec-v0.1` tag to test a claim of compatibility.
