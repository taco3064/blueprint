---
"@kekkai/blueprint": patch
---

selfOnly re-export selectors encode `/` as the `\u002F` regex escape: esquery below 1.7 has no `\/` escape in its regex literal, so the emitted selector truncated to a broken pattern and crashed ESLint — and `blueprint impact` — on every file of the selfOnly importer's layer, wedging doctor's survival check against the lint gate (field issue #19). Doctor's survival red now names both possible causes (a replacing flat-config entry, or a hand-folded copy that drifted from this version's output) and points at `rules --json` for the exact selectors, instead of asserting a merge collision that may not exist.

`rules` (text and `--json`) carries the exact `no-restricted-syntax` selector strings a selfOnly merge fold needs, per layer and target: the playbook demands "combine both option sets into ONE entry", and the only source for the selectors used to be an emitLint dump — exactly the bundle archaeology the same playbook forbids (field issue #20).
