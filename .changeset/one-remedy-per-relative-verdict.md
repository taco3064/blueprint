---
"@kekkai/blueprint": major
---

**Each relative-import problem reports under its own finding id, with a remedy that is
legal for it.** `relative-escape` carried three different situations, and because migration
steps are keyed per finding id, one sentence had to answer all three — *"replace
cross-module relative imports with the project alias"*. That was true for one of them.

- **`src-escape`** — the path climbed above the source root. Use the alias.
- **`entry-bypass`** — the path reached past a sibling's entry. Import that entry;
  `../Sibling` is the only legal spelling of a same-layer edge, and the alias form is
  banned here. The old advice sent you from one forbidden form to another.
- **`layer-escape`** — the path left its layer. Use the alias, or move the shared code down.

All three are still enforced by `blueprint/relative-escape`, exactly as
`no-restricted-imports` already carries three findings of its own.

**Action required if you keep a baseline.** A finding id is part of the entry key, so
entries recorded under `relative-escape` no longer match. The baseline document version
moves to `3` and an older file is **refused** rather than reinterpreted — reading it under
the new ids would suppress nothing and report your whole accepted ledger as fresh debt. Run
`npx blueprint inspect --update-baseline` once; it records the same debt, and suppresses
nothing that was not suppressed before.

The refusal message now explains what changed for *your* file's version, rather than
describing an earlier release's change to everyone who upgrades.
