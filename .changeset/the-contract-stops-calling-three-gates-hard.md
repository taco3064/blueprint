---
"@kekkai/blueprint": patch
---

**The full agent contract stops calling a gate hard where nothing keeps that promise.**
The contract written into tool-owned rule files — `.cursor/rules/blueprint.mdc` and
`.windsurf/rules/blueprint.md` — listed every declared `error`-tier rule under "Hard rules
(lint enforces these)". Three of them are not held by lint on the repo reading the sentence,
and the compact contract in `CLAUDE.md` / `AGENTS.md` had already been guarding against
exactly this.

**Regenerating changes three lines, and nothing else.**

- **`testFilename` disappears** where `architecture.testFiles: []` leaves the rule no scope
  to be emitted into — ESLint refuses `files: []`, so the entry was never in the config.
- **`deepWatch` disappears** on a React stack, which can never open it.
- **`cycles` is rewritten, not removed.** It is the one of the three that really is
  enforced, so it now names its own machine: *"`cycles` is held by `npx blueprint inspect
  --baseline` instead, so a green lint says nothing about it"* — the same sentence the
  compact contract already carried.

The two that disappear say nothing in their place, which is what the compact contract
already did for them. Their reason has not moved: the handbook's `nothing — <reason>` cell
and `blueprint rules` both still print it.

**Nothing else in any emitted document moves.** The compact contract and the handbook are
byte-identical, and the wording of a gate that genuinely is hard is unchanged. Measured
across thirteen blueprints rendered to all six agent targets plus the handbook: sixteen of
ninety-one files change, all of them the two targets that carry the full contract.

**What this does not fix.** On a project that spreads `emitLint` without injecting the
optional carriers, the contract still calls `explicitAny`, `codeStyle`, `statementsPerLine`
and `importBlock` hard while the emitted config contains nothing for them. That class is
decided by a fact about your dependency list, which a contract generated from the blueprint
alone cannot see, and both contracts have the same limitation. It is not addressed here.

No configuration changes, and nothing is asked of you beyond regenerating.
