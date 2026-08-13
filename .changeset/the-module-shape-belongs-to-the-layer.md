---
"@kekkai/blueprint": major
---

**`architecture.module` is gone — a layer carries its own `layout` and `entry`.**
Every 3.x config has one edit to make, including a flat project that is not adopting
modules, because `rejectUnknownKeys` refuses a field it does not recognise.

```js
// before
layers: [{ name: 'components', does: '…' }],
module: { layout: 'folder', entry: 'index', private: ['hooks', 'styles', 'types'] },

// after
layers: [{ name: 'components', does: '…', layout: 'folder' }],   // entry defaults to 'index'
```

- The error names the replacement, shows the shape, and says the edit is not optional —
  not the generic "nothing reads it", which would be true and useless.
- `module.private` is removed with no replacement. Enforcement does not weaken: no lint
  rule read it, and the entry-only ban already covers every non-entry file rather than
  three named parts. What goes is the ability to *describe* which private parts a module
  is expected to have.
- The per-layer `module: { … }` override is gone the same way — `layout` / `entry` sit
  directly on the layer.

**The handbook and the agent contract state the module shape per layer.** With one shape
across the layers they read exactly as before; where the layers disagree, each shape is
stated with the layers it covers instead of one project-wide sentence plus a list of
"exceptions". This fixes a wrong answer rather than only rewording: the handbook's
same-layer bullet was keyed on the deleted global field, so a mixed config was printing
one layer's rule for another's.

**Every emitted document said a same-layer import is banned outright. It is not.** A
folder layer's sibling is reachable through its entry with a relative path (`../Sibling`);
only the alias form, and paths reaching past that entry, are errors. The handbook, the
agent contract and the authoring playbook all stopped at an earlier reading of the rule
and prescribed "extract the shared code to a lower layer" — the advice
`blueprint/relative-escape` names as how a `utils/` junk drawer gets built one honest
decision at a time. If you adopted 3.x and sank shared code on that advice, the imports
you avoided were legal.

Two smaller corrections: a flat project's checklist no longer asks that "modules expose
only `index`" (a flat layer has no entry file to expose), and the handbook's example tree
is rooted at a layer that actually has the shape it illustrates.
