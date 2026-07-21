---
'@kekkai/blueprint': minor
---

Turn it red, then ratchet it — the debt posture flips, and the plain-init
poison path is fixed. Both from adoption field reports.

- **`init --authoring` now takes over a pristine preset scaffold.** A plain
  init on a small repo scaffolds a preset config; `--authoring` afterwards used
  to be a silent no-op (the config's existence skipped the fork entirely) —
  the one place field testers actually got stuck. A config byte-identical to
  init's own scaffold output is init-owned: `--authoring` removes it (a
  narrated `rm` action, dry-run aware) and writes the playbook. A hand-edited
  config is refused with an explicit error instead.
- **Debt doctrine replaced: red + dual ratchet.** The 1.9.0 "one ledger via
  severity warn" advice had a hole — `severity` only covers the structural
  rules, and warn means new metric debt (maxLines…) is never gated. The
  doctrine is now: keep `error`, lock architecture debt with
  `inspect --update-baseline` and lint debt with `eslint --suppress-all`
  (ESLint ≥ 9.24 — per file × rule counts, new violations still fail); CI
  blocks only new debt on both gates. `severity: 'warn'` is demoted to the
  ESLint-8 transitional fallback, with its cost stated. Playbook, adoption
  prompt, and docs all updated in both locales.
- **`doctor` grew a fifth check**: the lint suppressions ledger — entries
  pointing at files that no longer exist (or an unreadable ledger) fail, with
  the exact prune command in the detail.
- Reference docs now state plainly that `emit.lint.severity` covers only the
  structural family — metric rules keep their own `blueprint.rules` tiers.
