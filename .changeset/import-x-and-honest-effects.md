---
"@kekkai/blueprint": patch
---

**`init` no longer claims effects it did not produce, and its dependency list installs on ESLint 10.** One field report filed these as two findings; they are one causal chain, and either half alone still ships a broken repo.

`importBlock` now rides `eslint-plugin-import-x` instead of `eslint-plugin-import`, so the emitted ids are `import-x/first` and `import-x/no-duplicates`. The old package's peer range stops at ESLint 9 while the current ESLint is 10, and `npm install` resolves the required-deps list as a unit — so on any ESLint 10 project the whole install failed and not one plugin landed. The `-x` fork declares `^8.57 || ^9 || ^10`, and its two extra peers are optional, so the install surface is unchanged. `importBlock` has never appeared in a release, so no ledger carries the old ids.

A new guard keeps the class closed rather than the instance: every package in the required-deps list is a devDependency here, and a test reads its actual peer range and fails if it excludes any supported ESLint major. The capped dependency that ships next fails in this repo instead of in someone's adoption.

The narration is the other half. `init` used to print its entire plan with `✓` and apply it afterwards, so a step that threw left an output vouching for every effect below it. The install sits mid-plan with the alias writes beneath it: an adopter on ESLint 10 read `✓ write: vite.config.ts (import alias added — existing content preserved)` over a file nothing had touched, and the agent contract it shipped promised a `~app` alias that resolved nowhere. `doctor` caught it — but only after the lie, and only for someone who thought to ask. Effects are now announced as they land, the step that fails wears `✗`, and the error names the planned effects that did not happen plus two ways to finish: re-run `init` (idempotent — applied effects stay), or `init --no-install` to complete the file plan and install the printed deps by hand.
