---
"@kekkai/blueprint": patch
---

**An instruction states its reach, the same way a proof step does.** The heads-up added
last release told a fresh scaffold to run `npx eslint . --fix` once and land that pass as
its own commit. Correct advice, stated unconditionally — and while the layers are still
empty the pass does nothing, because `codeStyle` reaches only files a layer glob matches
and a starter's root files sit outside every one of them.

Two field agents caught it independently: one downgraded the step on its own judgment
("wait until the first file lands in a layer"), the other nearly filed it as a misleading
instruction and retracted only after deriving the reach from two other channels. The
playbook states reach for its lint and build steps in four places; this note did not. It
now says when the pass is worth its commit — which is the same moment the gate stops being
silent.

**A re-adoption is told that regenerated wording is the version, not drift.** When the
installed blueprint is newer than the one that wrote the committed contract and handbook,
init regenerates them with improved wording, and the diff looks like non-idempotency. Two
runs spent a cycle proving otherwise — one did a full copy-and-diff to confirm a second
run was byte-identical. The playbook now says it up front: take the new wording, report
that it changed, and never hand-revert generated text toward what git happens to hold.
