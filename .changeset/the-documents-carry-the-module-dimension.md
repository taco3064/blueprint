---
"@kekkai/blueprint": patch
---

**The three emitted documents now carry the module dimension.** `emit/docs` and
`emit/agent` read `architecture.modules` zero times, so a config declaring two modules
emitted a 163-line handbook mentioning them zero times: a flat handbook with a shorter
layer list, drawing `components/` at the source root — a folder that config does not have.
Every reader of these documents is an agent with nothing beside them.

**The handbook gains `## Modules`, above `## Architecture`.** The order is the point: the
layer flow is the *inner* one, and a reader who meets it first reads it as the whole
architecture. The section carries a table (what each module may reach, whether it is
layered, what it owns), the tree at full depth — module, its root entry, a layer, a unit —
and the address a layer actually has, `<root>/<module>/<layer>/`. `## Import discipline`
gains the three module boundaries; the flat unit tree is not drawn there under `modules`,
so one project still has one drawing.

**The agent contract splits by budget, because it is two documents.** The compact block is
what `CLAUDE.md` and `AGENTS.md` receive — 14 lines from the modular preset, and the one
nearly every adopter reads — so it gains exactly two: the outer flow, and the three bans.
The full contract (Cursor / Windsurf, 113 lines) carries them in prose.

**Two sentences the full contract emitted were false under `modules`:**

```
- `src/components/` — Reusable, presentational UI…      ← an undeclared module
- Restricted packages / globals live only in their owning layer
```

Every one of those four addresses names a top-level folder holding source, which
`undeclared-module` reports as an error — while `analyze`'s `layerAddress` and
`vacuousNextStep` already answer the same question with `<root>/<module>/<layer>/`. And
`ModuleDef.owns` bars a primitive in every *other module*, a second dimension neither
document rendered: a config where a module owns `lodash` printed the string zero times in
the handbook and zero in both contracts, under a sentence saying ownership is a layer's.

**`blueprint/no-module-reexport` is stated module-wide**, which is the width `emitLint`
emits it at — every `(module, layer)` entry plus the module zone. Entry-only prose
describes the two-hop bypass (an inner file re-exports, the entry re-exports that file) as
legal, to a reader who cannot check it. The non-fix travels with it: a wrapper added only
to clear the rule goes green and builds nothing, which is the third clause beside the two
the contract already carries.

**The playbook gains Method step 3, and it reads a verdict the document already prints.**
`survey` measures the root shape and states it with its reason before the Method runs, so
the step consumes that rather than re-deriving the heuristic — the reasoning stays in
`detectShape`, where it changes. Steps 3–9 shift to 4–10 (with the one reference naming
step 9), and step 4 branches: under `modular` the layer candidates sit one level down, or
the two steps contradict each other one line apart.

**Both structures gain the lint-green caveat.** `undeclared-folder` and `undeclared-module`
carry `ENFORCED_BY: null` by construction — the globs are built *from* the declared names —
so a green lint after creating a folder proves nothing about it, and under modules the
folder is outside every module ban too.

**The module/unit vocabulary is swept, unconditionally, in both structures.** `deps --json`
settled `unit` for the inner thing and `module` for the feature, and `emitLint`'s own
module-root message already says *"Import a **unit** through its entry"* — so the emitted
lint message and the emitted handbook contradicted each other on one repo. These three
documents were the last holdouts. `grep -c "feature module"` on the rendered playbook
returned 1: someone met the collision, fixed it where it bit, and left the rest. The sweep
takes the three strings that render into these documents from elsewhere — `survey`'s folder
heading, the preset's `naming.component`, and `undeclared-folder`'s migration text with its
near-verbatim quote in the contract — and one lint message whose twin already said `unit`.

Verified with a byte baseline over 74,796 rendered combinations, before and after: 324
distinct changed lines across the three documents, every one intended, and the flat arm
gains the caveat and the vocabulary without gaining anything modular.
