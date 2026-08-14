---
"@kekkai/blueprint": major
---

**`layers[].layout` takes `folder | file`. `flat` is rejected at config load, naming its
replacement.** The value describes what one **unit inside a layer** looks like —
`components/Button/index.tsx` against `components/Button.tsx` — and `file` says that without
borrowing a word the project skeleton needs.

```js
// before
layers: [{ name: 'components', does: '…', layout: 'flat' }],

// after
layers: [{ name: 'components', does: '…', layout: 'file' }],
// …or delete the key: omitting it resolves to the same shape, as it always has
```

- The error names the layer, the replacement and the shape to write, and says the other valid
  edit is deleting the line. Failing at load rather than at lint time is the point: a
  silently-ignored `layout` degrades to the default, and the project then lints green against
  the wrong unit shape.
- `folder` is untouched, and so is the default — a layer that declares neither key behaves
  exactly as before.
- The doc comment on the field is rewritten in the vocabulary this release settled: a **unit**
  is the thing inside a layer, a **module** is the feature. It read "one file per module",
  which described neither.

**Every emitted document that names the value names `file`**, and two of them were emitting a
config to copy:

- **The authoring playbook** told an adopting agent that a layer omitting both keys resolves to
  `{ layout: 'flat', entry: 'index' }` — twice, once inside the schema sketch's code block. A
  config written from that sentence would not have loaded, and the agent had no way to tell the
  document was older than the loader.
- **The handbook** reads `one module = one file (file layout)`; **the agent contract**'s
  module-shape line carries `file`; **`deps`** labels a collapsed row `(file-layout layer)`, in
  its output and in `deps --help`, matching the `folder`-layout wording beside it.
- **The migration hint for `architecture.module`** said the layout default was `"flat"` — a hint
  handing a 3.x adopter, mid-migration, a value 4.0 rejects.

**The emitted eslint config carries the new spelling too**: `blueprint/relative-escape`'s options
schema admits `['folder', 'file']` and its runtime default is `file`. That schema is shipped
surface — it is what turns a stale emitted config into a loud error instead of a rule quietly
running on defaults.

Doing it now costs nothing: `layout` is being moved onto the layer in this same release, so every
3.x config already has one edit to make here. Left alone, every release after this one carries a
config file in which `flat` means two different axes, and the fix costs a second major.
