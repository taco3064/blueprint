---
"@kekkai/blueprint": minor
---

**`architecture.modules` declares the outer one-way flow** — the ordered feature modules at
the root of the source tree, with `layers` describing what sits inside each one. Omit it and
nothing changes: `src/` stays the single implicit module.

```js
architecture: {
  alias: '~app',
  modules: [
    { name: 'app', does: 'Routing only.', layers: false, imports: ['GameStage', 'Session'] },
    { name: 'GameStage', does: 'The run, rendered.', imports: ['Combat', 'Session'] },
    { name: 'Combat', does: 'Bullets, collisions, damage.', imports: ['Session'] },
    { name: 'Session', does: 'The run state machine.' },
  ],
  layers: [/* what is inside one module */],
}
```

- **Isolated by default** — the opposite of the `layers` default, deliberately. A module
  imports nothing it does not name, and `imports` is written by the module that *has* the
  dependency, so adding one edits a single entry.
- **Order bounds what may be named**: only modules declared after it. The graph is one-way
  and acyclic by construction, so a backward edge is a validation error rather than
  something a cycle check finds later.
- **`layers: false`** opts a module out of the inner layer vocabulary — how a routing module
  is expressed, never keyed on the name `app`. It drops the layer flow, not governance.
- **A module and a layer may share a name.** Different depths, no path collision.

This release only validates the field. No glob, ban, finding or document reads it yet — a
config that declares `modules` emits byte-identical artifacts to the same config without it.
