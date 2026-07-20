---
'@kekkai/blueprint': minor
---

The contract stops flooding your context files:

- **Shared context files get a compact pointer block** — CLAUDE.md / AGENTS.md
  now receive ~12 lines: project facts (framework, alias, layer flow), the
  machine-gated rule list, and two links that carry the bulk — the generated
  handbook (project half, always current) and `agent-contract.md` shipped
  inside the package (generic operating discipline). Tool-owned rule files
  (Cursor, Windsurf) still carry the full contract.
- **`init --agent claude|codex` emits one contract file** — the tool actually
  in use, instead of one per tool nobody runs. An explicit `emit.agents` in
  the config still wins, and the authoring playbook now tells the agent to
  declare its own tool there.
- **Hand-written CLAUDE.md / AGENTS.md are never touched** — a context file
  without blueprint markers is a document someone maintains; init now writes
  a `<name>.blueprint.md` reference next to it with an integration instruct,
  and the authoring playbook's final step has the agent merge it into the
  document's own structure — link, don't duplicate.
- **The docs site gains a Changelog page** — build-time-included from the
  repo's CHANGELOG.md, so the same push that publishes a release renders its
  notes on GitHub Pages. Synced by construction, not by hand.
