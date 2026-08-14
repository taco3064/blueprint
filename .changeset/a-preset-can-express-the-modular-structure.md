---
"@kekkai/blueprint": minor
---

**`vuePreset` and `reactPreset` take `structure: 'flat' | 'modular'`.** Omit it and
nothing moves: the blueprint every existing call returns is unchanged, byte for byte
through the emitted documents. Pass `'modular'` and the preset declares the two
modules a tool can name without inventing a domain, and drops the two layers that
dissolve under them.

```js
// blueprint.config.mjs
export default reactPreset({ name: 'sky-1945', structure: 'modular' });
```

```
flat     pages → containers → components → hooks → contexts → services
modular  modules [app, common]
         layers  components → hooks → contexts → services
```

There is no CLI flag yet — `structure` is reachable by hand-writing the call, which is
the path this release covers.

- **`app` names `common`, and that edge is deliberate.** A module is isolated until it
  names a dependency, so the preset writes `imports: ['common']` on `app`. A routing
  module that may not reach the shared one is a scaffold whose first honest import is a
  violation, and a two-module preset has no other edge to express. `common` names
  nothing — the key is absent rather than empty, which is what "depends on nothing"
  already means.
- **`app` is a layered module, not `layers: false`.** A preset cannot know whether the
  adopter's router is file-based, so it picks the arm whose wrong guess speaks.
  Measured, one file off the layer grid in each arm: layered, `src/app/routes/Game.tsx`
  is reported outside the layer nets by the coverage line, with the clause naming which
  kind of file belongs there. With `layers: false`, `src/app/components/Nav.tsx` counts
  as covered while the inner layer flow does not govern it, and nothing in the output
  says so. An adopter whose router owns its folder names adds the key; the reverse is
  silent.
- **The two `allowedImporters` entries naming `containers` are deleted, not renamed.**
  They are two different shapes — an object with a description on `contexts`, a bare
  string on `services` — and a four-layer list carrying either does not construct, since
  every importer must be a layer declared earlier. What assembled a feature is now the
  module root, which is the implicit top layer and not a name in `layers[]`, so it
  already reaches every layer through that unit's entry and there is no permission left
  to spell. Rendered on the result: the module root's zone is unrestricted, and
  `components` is still barred from `contexts` and `services` — the two tightened
  imports the handbook names, which is what the `containers` entries were expressing.
- **`nextPreset` throws on `structure` rather than ignoring it**, and
  `NextPresetOptions` no longer inherits the field, so the generated API docs stop
  advertising a capability that throws. The message says what is missing — a modular
  Next layer list, and what becomes of `router` / `srcDir` — rather than that the shape
  makes no sense: Next's own `app/` is exactly what the modular model calls a module
  whose internals belong to the router. Undesigned, not impossible.
- **`owns` does not move.** `hooks` owns the state library, `contexts` the context
  primitive, `services` the HTTP client, in both structures. A module may own primitives
  too, but a preset knows no domain, so it declares none.
- **Flat output is unchanged, and that was measured rather than reasoned about.**
  Every conditional combination — `{vue, react} × {flat, modular}` — was rendered
  through `dist/bin.js init` before and after; the two flat arms are byte-identical
  across the config, the handbook, both agent contracts, the emitted eslint config, the
  scaffolded tree and the console output.
