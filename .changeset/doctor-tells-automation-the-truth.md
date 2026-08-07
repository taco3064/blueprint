---
"@kekkai/blueprint": minor
---

**`doctor` has three outcomes now, not two — and a check that could not run is no longer
counted as one that passed.**

The merge-survival check — the only one proving your emitted rules are alive in the config
ESLint actually resolves — skips rather than fails when that config will not resolve,
because a red you cannot appease is worse than no check. It used to ride in the pass
count anyway, so the output read `✓ … (skipped)` above `✓ Adoption complete — all 7
checks passed`.

What you see instead:

```
⊘ emitted rules survive the merged eslint config (skipped — could not resolve …)
⊘ Adoption unverified — 6 of 7 checks passed, 1 could not run (⊘ above).
  Nothing failed, and nothing here proves what those checks cover.
```

**Exit status is unchanged** — a skip is not a failure. Gate on the JSON instead of the
exit code when the difference matters:

```json
{ "ok": true, "verdict": "unverified",
  "summary": "⊘ Adoption unverified — 6 of 7 checks passed, 1 could not run …",
  "counts": { "total": 7, "passed": 6, "failed": 0, "skipped": 1 },
  "checks": [ { "label": "…", "ok": true, "skipped": "why it could not run" } ] }
```

`verdict` is `complete` / `unverified` / `incomplete` and is on `runDoctor`'s return value
too. `ok` keeps the meaning the exit code needs — nothing FAILED — so `counts.skipped` or
`verdict` is what a CI gate should read.

Three more things `doctor` now says out loud:

- **A green banner on a repo with no version control says what it leaves out** — nothing
  adoption wrote is committed, and a ratchet living only in an uncommitted working tree is
  not installed.
- **The survival check states its reach**: it compares config text and never executes
  ESLint, one probe per layer, and it does not compare thresholds, package ownership, or a
  merged entry covering only part of a layer. Its ✓ says so.
- **When it cannot resolve your config it quotes the loader**, so the missing package is on
  screen instead of one `npm run lint` away — and it names the case where that package is
  also absent from `package.json`, which means an install step never finished.
