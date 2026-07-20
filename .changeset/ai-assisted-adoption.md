---
'@kekkai/blueprint': minor
---

AI-assisted brownfield adoption — evidence, playbook, launcher:

- **`blueprint survey`** — deterministic authoring evidence that runs *before*
  a config exists: top-level folders with module-shape evidence (index
  coverage, nesting depth), the folder-to-folder import matrix (alias +
  relative, heaviest first), same-folder alias imports, test-convention hits,
  and package-usage concentration as ownership candidates. `--json` for
  tooling; `--alias` when tsconfig detection finds nothing.
- **The authoring playbook** — `init` on a brownfield repo without a config no
  longer guesses a preset: it writes `blueprint-authoring.md` (the method, the
  schema sketch, the acceptance gates, and the embedded survey) plus a
  `/blueprint-author` command file for Claude Code, and prints the launch
  one-liners. The playbook scopes itself honestly: author the config and lock
  the baseline — never refactor the debt. `--preset` keeps the old scaffold.
- **`init --agent claude|codex`** — the thinnest possible launcher: spawns the
  *printed* command in the foreground, interactive, under the user's own agent
  CLI permissions. Every artifact is on disk before the spawn, so a failed
  launch or an abandoned session degrades to exactly the manual path. The
  security disclosure is amended accordingly: never launches by default,
  explicit opt-in only, still zero network calls and zero credential surface.

Field-tested end to end on a mature React + TypeScript repo: the playbook's
evidence alone reproduced the hand-derived 11-layer config — same 246 baseline
findings, same categories, same cycle.
