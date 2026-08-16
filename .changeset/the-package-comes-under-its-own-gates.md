---
"@kekkai/blueprint": patch
---

**Internal: this package now runs the rule set it recommends against its own code, at
`error`.** Nothing you import, call or configure changes — `dist/index.d.ts` is
byte-identical and the fifteen exports are the same fifteen. The preset's own tiers are
untouched: `maxLinesPerFunction`, `maxParams`, `maxStatements` and `complexity` still
ship at `warn`, and raising them is a choice made in this repo's `blueprint.config.mjs`,
not a new default in yours.

- **What an adopter actually receives did move.** Bringing this tree under those gates
  split thirteen new modules out of existing ones, so the tarball carries 89 files
  instead of 76 — 221.6 kB → 239.6 kB packed, 688.9 kB → 742.0 kB unpacked. Thirteen
  declaration files are new and fifteen changed; none of them is a supported import path,
  since `exports` maps `.` only.
- **No emitted document moved.** Every emitter was rendered over 78 blueprints before and
  after the refactor — 3532 documents per side, `diff -r` empty — so the handbook, the
  agent contract, the emitted lint config, the survey and the authoring playbook you
  receive are unchanged byte for byte.
- **Nothing is suppressed.** No `eslint-suppressions.json`, no `.blueprint-baseline.json`,
  and no threshold was tuned to fit the code it measures.
