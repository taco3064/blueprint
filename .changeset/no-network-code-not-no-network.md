---
"@kekkai/blueprint": patch
---

**The README promised "no network access — local file operations only" beside a command that runs
`npm install`.** The full doctrine on the docs site is accurate and always was: one section says the
package contains no network code, and a separate one declares both child processes, the `init`
dependency install among them, with `--no-install` as the way to skip it. The README compressed that
into a single line and kept only the first half — and the README is the copy that ships inside
`node_modules`, which is the one an adopting agent actually reads.

A field agent read it, ran `init --preset` in a sandbox with no registry, waited three minutes on a
silent install, and then verified the contradiction by running the install command the tool had
printed: `getaddrinfo ENOTFOUND registry.npmjs.org`. Nothing was stuck; the sentence was wrong about
its own boundary.

It now says **no network code** — nothing here opens a socket, no telemetry, no update checks — and
names the one command that reaches a network, when it runs, and how to skip it. The docs site's
feature list carried the same compression and now names the two child processes too.
