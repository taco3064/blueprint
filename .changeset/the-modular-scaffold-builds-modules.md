---
"@kekkai/blueprint": patch
---

**`init --structure modular` builds the declared modules, not the layers.** `plan`
iterated `architecture.layers` whether or not the config declared `modules`, so a fresh
modular `init` on an empty tree created `src/components/`, `src/hooks/`, `src/contexts/`
and `src/services/` — four top-level folders that are `undeclared-module` at error tier
under the very config the same run wrote, and the exact positions the `missing-layer` note
tells the adopter not to create. The run contradicted itself twice more: the handbook it
emitted drew `src/<module>/<layer>/`, and the `--structure` refusal it prints on a fresh
tree already described modular as "feature modules at the source root".

**The predicate is unchanged; the list it iterates is what moved.** Where code already
lives, an unbuilt position's absence is still its true state — a `.gitkeep` shell is the
manufactured net the playbook forbids. What the scaffold materialises where the tree is
empty is now the config's answer rather than a constant:

```
flat,    empty tree     → the declared layers      src/pages/ …        (unchanged)
modular, empty tree     → the declared modules     src/app/, src/common/
either,  files present  → nothing                                      (unchanged)
```

Under `modules` each declared module gets its entry (`index.ts` / `index.js`), and the
first one gets the framework entry (`main.tsx` / `main.jsx` / `main.ts` / `main.js`) —
**only where `init` generated the config in this run.** `index` is fixed by the model;
`main` is a framework fact the preset knows, so it cannot be keyed on a module's *name*,
and a hand-written `[Fighter, Combat, common]` must not receive `Fighter/main.tsx`. The
positions land at `architecture.sourceRoot`, so a modular config at the project root gets
`app/` rather than `src/app/`.

Flat scaffolds use `mkdir` (which leaves a `.gitkeep`, or git cannot carry the folder);
modular ones write real files. The asymmetry is the model: what goes inside a layer is a
unit whose name blueprint cannot know, while a module's entry name is fixed at `index`.

**The run now says why a two-module tree is not a failed run**, with the three jobs #193
named, each carrying its cause and its next step in the same line — this is the step
finished rather than half-done, no feature module was created because blueprint cannot
name a domain it has never seen, and the shape is drawn in the emitted handbook. On a tree
that already holds code the third becomes the whole answer: nothing was scaffolded, an
empty module folder beside existing code is a net that catches nothing, and *nothing on
disk demonstrates the shape*.

**That second note points at `inspect` and never predicts it.** Root files are read as
wiring and such a tree is clean — but one top-level folder makes it `structure-mismatch`
plus `undeclared-module`, 2 errors, and on this same path `templateCleanup` prints those
findings a few lines below the note. A claim of "clean" there would be the run
contradicting its own output.

**The scaffolded content interpolates no module name.** These files land inside the
governed net, where `codeStyle` runs `@stylistic/max-len` at 90 — comments included, and
with no fixer — so a line built from the module name passes on `app` and turns an
adopter's first `npm run lint` red on a real domain. The test that holds it uses a long
module name, or it cannot bite.
