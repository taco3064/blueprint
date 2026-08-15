---
"@kekkai/blueprint": minor
---

**`inspect` now reports the module it says it governs, all the way down.** Three places
where a module was governed by the emitted config and silent in `inspect`, all in
`analyze`, and two of them the shape this release has now found five times: lint red,
`inspect` quiet.

**A `layers: false` module is judged as one zone, not only at its root.** The per-file pass
opened with a layer test, so every file below such a module's root returned no findings at
all — while the emitted config reaches all of them, because `resolveModuleFiles` widens
that module's own entry from `src/<M>/*` to `src/<M>/**/*` and no layer glob is emitted
inside it. Measured on a router module declaring one dependency, four judgments were a
`no-restricted-imports` hit in `blueprint impact` and nothing in `blueprint inspect`:
an undeclared edge, a reach past a declared dependency's entry, a cross-module re-export,
and a package another module `owns`. Those are four of the things `ModuleDef.layers`
already promised still reach inside. All four now answer, and the module root and a file
three folders down give the same verdict on the same import.

The layer-keyed judgments stay off there, which is the other half of the fix: a module that
opted out of the layer vocabulary has no layer to leave, none to be forbidden from, and no
root to reach up to, and a real lint run is green over all of them. The zone is read
through the same `moduleZone` doctor dispatches its probes on, so the two passes cannot
answer differently about which entry a file sits under.

**An undeclared folder inside a *layered* module is unchanged, deliberately.**
`src/Fighter/scratch/` is matched by no emitted glob at all, so lint is green there by
construction and a finding would be red against it — with a remedy (declare a layer, or
move the code into one) that is the owner's call. `coverage` names that file by path
already, which is the level positioned to act on it.

**A declared module with no entry is now reported.** `no-entry` only ever meant a unit
folder inside a layer, so a module whose folder held code but carried no `index` — the one
address another module may write for it, and the only thing `~app/<Module>` can resolve to
— was reported by nothing. It is the same rule id with its own sentence, the shape
`deep-import` already carries, and it fires only where `modules` is declared and only on a
module whose folder holds source; a declared module with no folder is still
`missing-module` and its "runway, not a todo" remedy. `init --structure modular` writes
an entry into every module it builds, so a freshly scaffolded tree is unaffected.

**Three `inspect` messages called a unit a "module", and so did one lint message.** #190
settled the vocabulary — a module is the feature at the top of the source tree, a unit is
the folder inside a layer — and the sweep that followed it covered the emitted documents
and not `analyze`. So `emitLint` said *"Import a unit through its entry"* while `inspect`
called the same thing a module, in one repo, and `entry-bypass` differed from the plugin
rule it shares a single `relativeVerdict` with by exactly one word. `no-entry`,
`deep-import`'s unit branch, `entry-bypass` and `emitLint`'s entry-only ban now all say
unit; the branches that mean the feature still say module. Unconditional, both structures —
a rename gated on `modules` leaves two spellings in one product.
