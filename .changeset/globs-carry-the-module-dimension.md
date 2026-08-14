---
"@kekkai/blueprint": minor
---

**Layer globs and coverage carry the module dimension.** With `architecture.modules`
declared, the file set every emitted rule scopes to is the product of the declared modules
and the declared layers, plus each module's own root.

- **Expanded per declared module, never `src/*/<layer>/**`.** A single wildcard would match
  a module nobody declared — a typo like `src/Figthter/` — and coverage would count its
  files inside the net while no module-level rule governed them. That state is
  half-governed and green, which is worse than ungoverned and red, and it is what makes
  "an undeclared module is matched by nothing" true rather than aspirational.
- **The module root is inside the net.** `Fighter/Fighter.tsx` and `Fighter/index.ts` sit
  above every declared layer. Left out, a module's most important composition code would be
  matched by no glob, exempt from every metric gate, and permanently listed as outside the
  coverage net.
- **A `layers: false` module contributes one recursive net.** It opts out of the layer
  vocabulary, not out of governance: everything that does not depend on layer names still
  reaches inside it.
- **A custom `layerFiles` must carry `{module}`**, as the first segment under the source
  root with `{layer}` immediately after — the one legal topology, since modules do not nest.
  The reverse is rejected too: a `{module}` placeholder with no `modules` declared would
  leave a literal `{module}` directory in the glob, matching nothing and reporting as a
  clean net.

`impact` now shares that resolver instead of walking the layers a second time. Split, the
two answers diverge under modules and the number `impact` reports is about neither the
config it emitted nor the files it linted.

Flat configs are unaffected: the emitted lint config is byte-identical across three presets,
a custom `layerFiles` and a project-root `sourceRoot`.
