---
"@kekkai/blueprint": patch
---

**The merge instruction stops walking into the trap it opens with.** A field run on a Vue repo with a `selfOnly` layer declaring two importers found that "combine both option sets into ONE entry" is written for a single collision and misleads on several.

`emitLint` scopes its entries per layer, so one rule key can own more than one. A `selfOnly` layer with two importers emits `no-restricted-syntax` on **both** importer layers, and a house rule may overlap only one of them. Read literally, the instruction leaves two exits and both are wrong: widen the combined entry to cover the other layers and your rule now governs files it never did (a visible new red — the run's repo had hard-coded date literals waiting in the second layer), or narrow it to exclude them and flat-config replacement deletes their emitted ban while lint stays green. That second one is the exact failure the same paragraph warns about two sentences earlier.

"ONE entry" now says it means one per *collision*, not one per rule key: combine with the entry you actually collide with and leave the others exactly as emitted. `npx blueprint rules --json` is named as the way to see the emit points before merging rather than after — two importers show up as two. And since a warning that only says "be careful" is not much of one, the paragraph also names the gate behind it: doctor's survival check probes every layer separately and names the layer that lost its selectors, so the silent branch is not silent at the acceptance gate.
