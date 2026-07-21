---
'@kekkai/blueprint': minor
---

Brownfield honesty pass — from a legacy-repo (ESLint 8 / `.eslintrc`, 239
pre-existing violations) field report.

- **`import/no-cycle` dropped from the generated eslint config.** `inspect`
  already detects module cycles; the ESLint rule re-checked the whole graph
  per file — measured at 92s on an 850-file repo. One detector, the cheap one.
  `eslint-plugin-import` leaves the install set with it.
- **The single-ledger posture is now doctrine.** Playbook + docs: on a repo
  with existing violations, wire `emitLint` at `severity: 'warn'` and let
  `inspect --baseline` be the only debt ledger — never lock the same debt as
  both eslint suppressions and a blueprint baseline; flip to `error` at zero.
  New "Legacy ESLint — one ledger, never two" section on the AI-adoption page,
  and the legacy-`.eslintrc` cliff is named in Field-Tested notes (with the
  pinned-plugin drift caveat).
- **The gitignored-contract warning is now actionable** — it says exactly how
  to start tracking the files, not just that teammates won't have them.
- **Honest positioning, stated where it matters**: the Philosophy page opens
  with "blueprint encodes an architecture someone already chose — it does not
  design one for you", and the README credits that the lint layer is standard
  ESLint machinery: the rarity is that rules, handbook, agent contract, and CI
  compile from one source and can never disagree.
