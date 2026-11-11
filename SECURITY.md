# Security policy

Wirelith is designed to be safe to render from untrusted input. If you find a way around that, please tell us privately.

## How to report

Use GitHub's private vulnerability reporting: open this repository's **Security** tab and choose **Report a vulnerability**. Only the maintainers can see the report.

Please don't open a public issue, discussion or pull request about a vulnerability before it is fixed.

Include the smallest source or input that shows the problem, which package and version you used, and what happened.

## In scope

Anything that lets a Wirelith source, a theme, or a source read back from an SVG or PNG:

- cause a network request;
- run code; or
- make a renderer emit markup outside the SVG element and attribute allowlist in the specification.

Also in scope: a size limit from the specification that a package doesn't enforce, and a package that reads or writes files beyond what it was asked to.

## Out of scope

- How a host application inserts the SVG into its own pages. The specification explains what a host must still do.
- Denial of service from inputs within the specification's size limits, unless the cost is far beyond linear.

## Supported versions

Wirelith is at 0.x. Only the latest release of each package receives fixes.
