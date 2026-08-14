---
"@kekkai/blueprint": minor
---

**Feature modules govern each other.** With `architecture.modules` declared, `ModuleDef.imports`
compiles into `no-restricted-imports` groups: a module reaches nothing it has not named, and a
module it has named only through that module's entry.

The graph policy is the inverse of the layers', and deliberately. A layer defaults to reaching
everything downstream and `allowedImporters` narrows it; a module reaches **nothing** until it
names a dependency. So the emitted groups enumerate what is banned rather than what is allowed —
built from the declared set minus what the module named, never from a rule about ordering, so
reordering the array buys no access.

- **An undeclared module is banned at its entry and inside it**; a declared one only past its
  entry, so `~app/Combat` resolves and `~app/Combat/hooks/useDamage` does not.
- **All three zones are governed** — the declared layers, a layered module's own root, and the
  whole recursive net of a `layers: false` module. The last two get their own entry, since no
  layer glob reaches them.
- **The module root reaches its own layers through their units' entries**, closing in lint what
  `inspect` already reported: the alias spelling of a past-the-entry reach had no entry to live in.
- **A module's `owns` bars a package or global in every other module**, exactly as a layer's bars
  it in every other layer, and `inspect` reports it at both levels rather than only one.

**`blueprint/no-module-reexport` bans passing another module's surface through your own.** It
follows the local *binding*, not the path, so every spelling is the same violation: `export … from`,
`export *`, an import re-exported in a second statement, either direction of renaming,
`import * as`, `export default`, and all three type-only shapes. It is module-wide rather than
entry-only, because an inner file re-exporting a dependency and the entry re-exporting that inner
file hands the surface out anyway.

**A wrapper is deliberately not banned.** A module entry exposing `startGame()` that calls into a
declared dependency is composition, and no static tool can separate a domain abstraction from a
pass-through. The guarantee is stated at the width it holds — another module's public surface
cannot be re-exported *verbatim* — and the message names the non-fix, since wrapping a forward in
a function clears the rule and builds nothing.

The paired `module-reexport` finding shares one verdict function with the rule, so lint and
`inspect` cannot disagree about which module a specifier hands over. `blueprint rules` reports the
new entries too, each row saying which zone it governs.

Flat configs are unaffected: the emitted lint config is unchanged across fifteen configurations
including all three presets.
