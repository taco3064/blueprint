---
'@kekkai/blueprint': patch
---

Batch-8 field fixes, all with repros. `usePrefix: 'off'` no longer validates its target layer (an off rule has nothing to target — it used to throw on repos without a `hooks` layer). `impact` stops contradicting itself: `parse-error` and `unused-disable-directive` move out of the wiring-red total into an "Isolation caveats" section that says which kind vanishes after the merge and which survives. The handbook diagram renders order-only spine edges dotted and declared importer relations solid with inline labels — consecutive leaf layers chained solid read as dependencies they never were. The playbook's overlapping-tool guidance gains its missing exception: when the existing tool sets the same ESLint rules emitLint emits, coexistence is mechanically impossible and consolidation becomes a wiring precondition, not a scope decision to flag.
