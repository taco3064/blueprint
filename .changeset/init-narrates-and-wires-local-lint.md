---
'@kekkai/blueprint': minor
---

`init` UX: the silent decisions now speak, and local lint matches the CI gate.
All four from a field report of a fresh vite react-ts adoption.

- **The greenfield/brownfield fork is narrated.** When a repo has fewer than 10
  source files, init scaffolds the preset — and now says so
  (`Fresh scaffold (N source files < 10) — scaffolding the framework preset.
  Repos with 10+ source files get the authoring playbook instead.`) instead of
  silently taking the biggest branch it has.
- **Local lint gets wired to the structural rules.** Templates whose `lint`
  script doesn't run eslint (e.g. oxlint) previously stayed green locally while
  CI failed on the generated config. On a fresh scaffold init now patches the
  script (`"lint": "oxlint && eslint src"` — precondition-guarded, placed
  before the install step, visible in `--dry-run`); existing projects get an
  instruction instead.
- **The generated eslint header no longer contradicts `--help`.** The banner
  now explains that only the blueprint-owned file (marked by that banner) is
  regenerated, while hand-written configs are never overwritten; `init --help`
  says the same.
- **The default agent-contract pair is surfaced.** When the config doesn't
  declare `emit.agents`, init notes that both CLAUDE.md and AGENTS.md were
  written and points at the narrowing the playbook itself recommends.
