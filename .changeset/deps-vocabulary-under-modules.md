---
"@kekkai/blueprint": minor
---

**`deps` addresses both meanings of "module", and the module graph is live under
`architecture.modules`.** The graph guard read `segments[0]` as a layer, so on a modular repo
every file was skipped, the graph was empty, and both consumers went quiet — the `cycle` finding
and the whole of `deps`. An empty graph and a healthy repo produced identical output.

Opening that guard alone would have made it wrong rather than silent, which is why the key moved
with it:

- **The module segment is part of the node key.** Without it `Fighter/hooks/useInput` and
  `Combat/hooks/useInput` collapse into one node — `detectCycles` reports a cycle nobody wrote,
  and `relativeVerdict` answers `ok` to a relative import that crosses a module boundary into a
  same-named unit. That second one was a live false negative in **both** structural gates, since
  the lint rule and `inspect` share that function.
- **Both spellings of one target land on one node.** `~app/Combat` and `../../../Combat` resolve
  to the same module. Given the offset to the alias arm alone, one function would have keyed
  alias imports at module depth and relative imports at layer depth.
- **Module roots and `layers: false` modules are in the graph.** `Fighter/index.ts` importing
  `~app/Combat` is the edge a reader most wants, and a routing module is usually the one
  importing everything — read through the layer test, neither contributes an edge at all.

**Both granularities are addressable:**

- `blueprint deps Fighter` — what the module declares, and which modules declare it.
- `blueprint deps Fighter/hooks/useInput` — the unit. Its blast radius **stops at the module
  boundary**, because a cross-module import resolves to an entry and passing a dependency through
  one is banned, so the answer says that outright and closes with the module's own fan-in. A
  count read as the whole radius under-reads it; read as a cross-module one it over-reads it.
- The leaderboard prints **both rankings, labelled** — they answer different questions, and one
  list silently answers whichever the reader did not ask.

**`--json` renames rather than disambiguating in prose:** `module` is the feature and the inner
thing is `unit`, the name it always deserved. `4.0.0` is where that is free.

A flat project is untouched: `deps` output is byte-identical, text and `--json`, across the
leaderboard, a unit target, a file path, a flat-layout layer and an unknown target.
