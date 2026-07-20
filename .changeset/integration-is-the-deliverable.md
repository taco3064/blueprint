---
'@kekkai/blueprint': minor
---

Integration is the deliverable — reference files are input, not output:

- **The authoring playbook now owns the lint wiring.** The agent merges
  `...emitLint(blueprint, …)` into the existing flat config, resolves every
  rule conflict explicitly (house disable conventions, overlapping structure
  tools), runs the project's own lint, and deletes the reference — adoption
  is not done while any `*.blueprint.*` file remains, and the acceptance
  gates say so. Legacy `.eslintrc.*` configs are the one exception: that
  migration is surfaced as a decision item, never done unilaterally.
- **A clean repo carries no baseline.** `inspect --update-baseline` with zero
  findings writes nothing (and retires a paid-off baseline file);
  `inspect --baseline` with no file treats it as empty — one uniform CI line
  on repos with and without recorded debt.
- **init recognizes its own eslint config.** Generated configs carry a banner
  line; a re-run regenerates the file in place instead of mistaking its own
  output for a hand-maintained config and writing a reference next to it.
- **init warns when its artifacts are gitignored** — a best-effort root
  `.gitignore` check: if the handbook or a contract file is invisible to
  version control, the plan says so (the compact contract links assume they
  exist) instead of leaving teammates with dead links.
- The greenfield `--agent` skip message no longer claims a config "already
  exists" three seconds after scaffolding it, and `deps` module keys for
  bare-file modules drop their extension (`components/HelloWorld`, not
  `components/HelloWorld.vue`).
