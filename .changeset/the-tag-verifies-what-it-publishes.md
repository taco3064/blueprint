---
"@kekkai/blueprint": patch
---

**The release job verifies the `dist/` it publishes.** `release.yml` ran lint, tsc,
test and build, then published — with no `dist:verify` between them. main's CI runs it
right after its own build; the job that actually ships did not.

A tag can point at a commit main's push gate never saw, and even on a tag main did
gate, the tarball npm receives is built by the release job itself. `dist:verify` is
the only layer that executes `dist/bin.js`, resolves the `bin` field through an
npm-style symlink and imports the package entry — the layer where the 0.1.1 symlink
bug lived, a state every in-process test passes. Omitting it from the publish job put
the check everywhere except the last place it can still catch anything.
