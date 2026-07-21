---
'@kekkai/blueprint': patch
---

API-surface and docs-site review sweep.

- Six internal helpers (`getDiagramEdges`, `getForbiddenLayers`,
  `getModuleShape`, `getSelfOnlyTargets`, `normalizeAgentEmit`,
  `normalizeAllowedImporters`) are now `@internal` — they were never runtime
  exports of the package root, but typedoc listed them as importable Functions.
- `AgentContractOptions`, `CiOptions`, and `PackageManager` are now exported
  types (they appear in public signatures and previously dangled unresolved in
  the API docs).
- API reference is grouped (Author / Emitters / Runtimes / Utilities) via
  `@group`; every headline function carries an English `@example`;
  `Blueprint.framework` / `Blueprint.architecture` gained the TSDoc they were
  missing; the zh-TW API index states it is intentionally rendered in English.
- Docs site: landing grew the compile-model diagram, a "Why" section, and two
  more cards (Adopt / Verify); new "Prior Art & Differences" page (en + zh-TW);
  en security page caught up with two zh-only facts; og/twitter meta added.
