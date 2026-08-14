---
"@kekkai/blueprint": minor
---

**The inner layer bans reach inside a module.** Under `architecture.modules` the emitted
`no-restricted-imports` entry is now built per (module, layer), and every alias pattern in
it carries that module's segment — `~app/Fighter/hooks/**`, the path a modular import
actually spells.

Three bans were emitted against `~app/<layer>/**` and matched nothing on a modular repo:
the same-layer ban, the forbidden-layer ban, and the reach past a folder-layout unit's
entry. The `selfOnly` re-export selector was anchored the same way and had the same
outcome. Meanwhile `inspect` read those imports at module depth and reported them, so the
two gates disagreed about the same file with the lint half silent — a rule that resolves,
costs nothing to satisfy, and enforces nothing.

- **The ban cannot be shared across modules**, because it names the importing module's own
  segment. That is why the file set could gain the module dimension on its own and the
  patterns inside it could not follow: the entry itself had to split.
- **The per-module glob set is now the atom.** `resolveLayerFiles` and
  `resolveGovernedFiles` are the union of it rather than a second derivation beside it, so
  the emitted entries, the coverage net and `impact`'s lint targets still cannot drift
  apart.
- **Doctor's expectations move with the emitter.** Its probe carries the module it was
  taken from, so an intact modular config verifies green instead of reporting every
  structural pattern as lost.
- **The fixture roots stay unscoped.** They sit at the source root and belong to no module;
  `~app/Fighter/fixtures` is a path no repo has.

A `layers: false` module still gets no layer-flow entry — it has no layer flow to govern —
and cross-module edges stay silent here, since those are declared with `imports` and banned
separately.

Flat configs are unaffected: the emitted lint config is byte-identical across nineteen
configurations, including all three presets, a custom `layerFiles`, additional aliases and a
project-root `sourceRoot`.
