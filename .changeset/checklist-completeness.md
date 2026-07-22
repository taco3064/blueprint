---
"@kekkai/blueprint": patch
---

Field issue #9 — the early-exit checklist honors its own completeness claim
on every repo shape: step 1 carries the tool declaration (`init --preset
--agent claude|codex` persists into `emit.agents`, one run emits one
contract); step 2 verifies `inspect --baseline`; the false guarantee "no
reference file is ever written" is replaced by the conditional truth — a
repo with its own eslint config DOES get a reference, and the checklist now
carries the merge-and-delete step for it. The anti-bypass guard's plugin is
provisioned on every path again: with ADOPT as the stated default, an agent
following it must not hit "Cannot find package" — dropping the block is the
exception, and the guard says to remove the dependency with it.
