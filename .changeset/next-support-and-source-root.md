---
'@kekkai/blueprint': minor
---

Configurable source root, first-class Next.js, and Nuxt declared unsupported —
the terrain widens from "everything under `src/`" to real framework layouts:

- **`architecture.sourceRoot`** (default `src`) generalizes the engine off the
  hardcoded `src/` assumption. `.` scans the project root (with a built-in
  ignore set for `node_modules` / `.next` / build output); the alias target,
  layer-file globs, and vite/tsconfig wiring all follow it. Backward compatible
  — every existing config keeps `src`.
- **`nextPreset({ router, srcDir })`** and auto-detection. A fresh
  `create-next-app` adopts in one command: init detects the route tree
  (`app` / `pages`, under `src/` or the root) and generates the Next preset —
  the route dir is the top layer, flat module layout, and **no `fetch`
  ownership** (server components fetch everywhere by design). Both routers
  reduce to the same shape; because Next keeps imports explicit, the dependency
  graph is real and enforcement is genuine.
- **Nuxt is refused, by design.** Its auto-imports leave no import statements
  for static analysis, so the graph would be near-empty and report a hollow
  "clean". `init` errors with an explanation rather than emit a false-green
  setup. Documented under "Not supported" on the field-tested page.
- **The adoption e2e suite grows to ten fixtures** covering the tiers approved
  for this round: the ratchet catching a *new* violation (not just staying
  green), the JS-project jsconfig branch, `--dry-run` writing nothing,
  survey + deps on a real repo, the `--agent` launch ordering, the emitted CI
  gate, a yarn workspace, and `--no-install` — plus the two new Next fixtures
  (root-level app router, pages router).
