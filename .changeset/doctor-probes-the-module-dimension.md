---
"@kekkai/blueprint": minor
---

**Doctor's survival check probes every emitted entry, not one per layer.** Under
`architecture.modules` the emitted config holds one `no-restricted-imports` entry per
(module, layer) plus one per module zone — and the check sampled one probe per layer, so
whichever module sorted first spoke for all of them. A merge that replaced the rules of every
other module passed.

The argument for one probe per layer is the same one level up, and `pickProbes` already carried
it: a single probe green-lights an entry that swallows some *other* entry's rules, which is the
scoping this check exists to catch.

- **One probe per (module, layer)**, in both arms. The synthetic arm matters more, not less: a
  greenfield modular scaffold has nothing on disk, so every probe comes from it.
- **Module zones are probed** — a layered module's own root, and the whole of a `layers: false`
  module. Those entries govern a module's composition code and a router's entire subtree, and
  nothing verified them.
- **Losses name the entry they belong to.** `Fighter/hooks`, `Fighter/(root)`, `app/(all)`. Two
  modules losing the same ban printed as one line before, so an adopter fixed the one they found
  and left lint green on the other.
- **`expectedModuleBans` is a sibling of `expectedStructural`**, not a parameter on it: that
  function is keyed on a layer name from end to end, and a module zone has no layer to key on.
  What it expects is what the zone entry actually holds — the cross-module bans, the ban on
  reaching past a unit's entry from the root, and the globals another module owns.
- **The embedded plugin rules are compared**, so a merge that switches
  `blueprint/no-module-reexport` off is a named loss rather than a silent one — the same treatment
  `blueprint/relative-escape` already had.

Measured end to end on 41 modules × 5 layers, 241 probes: **0.16s green, 0.20s red**, and the red
names the single module whose entry was gutted.

Flat projects are unaffected beyond one reworded sentence: with no modules declared there is one
scope, one probe per layer, and the same labels as before.
