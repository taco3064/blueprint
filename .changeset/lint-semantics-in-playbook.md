---
'@kekkai/blueprint': patch
---

Authoring playbook now states the emitted-rule semantics up front (flat vs folder same-layer imports, the pre-wiring "Same-folder imports via the alias" count, `unusedVars` options, doctor's "wired" criterion) so agents stop reverse-engineering them from the bundle; intent-document translation gains a stale-clause downgrade rule; the survey import matrix notes that it counts test files while inspect does not.
