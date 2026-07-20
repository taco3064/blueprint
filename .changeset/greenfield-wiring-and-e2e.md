---
'@kekkai/blueprint': minor
---

The rules stop assuming infrastructure nobody installed:

- **Greenfield alias surgery.** On a fresh scaffold (init generated the
  blueprint config in this very run), init now wires the import alias
  directly into the template's `vite.config.*` (resolve.alias + the
  `node:url` import) and into the commented tsconfig (comment-preserving
  `paths` insertion) — precondition-guarded text edits that only touch the
  known template shapes, visible in `--dry-run`, falling back to the
  instructs on anything unexpected. Existing projects never take this path;
  the security disclosure is amended accordingly.
- **Adoption e2e suite.** Five committed template fixtures — vite react/vue,
  Next (App Router + forwarding CLAUDE.md), a turbo + pnpm workspace package,
  and a brownfield repo with planted debt (upward reaches, a same-layer
  import, an import cycle, hand-written eslint/CLAUDE files) — driven through
  the full init → inspect → baseline → references → wired/integrated arc.
  The suite lives in the default vitest set, so the husky pre-commit and the
  new pre-push hook both gate on it locally, and the release workflow runs it
  before anything is published to npm.
- **Weekly terrain workflow.** Scaffolds the *latest* create-vite /
  create-next-app templates and drives the real adoption with the CLI built
  from HEAD — upstream template drift reddens the run and opens a
  deduplicated issue instead of surprising the next adopter.
- The handbook's flow diagram now states its reading rules (reachability is
  transitive; dashed = selfOnly), and the packaged operating discipline
  covers conflicts with third-party lint advice — both straight from agent
  feedback on a field adoption.
