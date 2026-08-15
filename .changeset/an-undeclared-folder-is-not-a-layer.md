---
'@kekkai/blueprint': patch
---

**A folder sharing a declared layer's name, under a top folder `modules` does not declare, was judged as that layer.**

`src/scratch/hooks/useX/index.js` drew eight judgments — both levels of `package-ownership`, `deep-import`, `flow-violation`, `root-import`, `module-reexport` and the relative family — from a config that governs it with nothing. The layer globs are expanded over the DECLARED module list, so no emitted entry reaches that path at any depth, and a real lint run over the same tree reports zero. Three lines above, the same report's `undeclared-module` says "nothing governs it … lint stays green throughout".

`fileZone` now answers which emitted entry governs a file — `root`, `module`, `layer`, or none — instead of answering for a module's own entry and leaving `null` to mean both "a layer governs it" and "nothing does". That second meaning was the defect: the per-file pass finished the answer by reading the layer name itself, and a name that matches while no glob reaches it let the file back in. `depth` is derived inside the function so the module list and the offset into the path come from one architecture.

`no-entry`'s unit branch is qualified by the same predicate. It asked for a declared layer NAME while the module branch it shares a rule id with has asked `modules` since it was written, so it reported inside an undeclared folder and inside a `layers: false` module — where the module's own opt-out already says a folder sharing a layer's name is not that layer.

What still reports, unchanged: `undeclared-module` names the folder, at the level that can act on it, and `coverage.outsideNets` names each file. Findings inside declared modules, `layers: false` modules and flat projects are byte-identical.
