---
"@kekkai/blueprint": patch
---

Closing-round polish from field issues #27–#28 (zero blockers across four scenarios): the survey's "Same-folder imports via the alias" section always prints — an explicit `0 (none found)` instead of a silently absent row the playbook cites; the one-gate-per-semantic rule now spans gate layers (a house `import/no-cycle` and the inspect-side `cycles` gate are one semantic — pick one detector); the `owns` sketch states that repeating the same entry across layers IS the shared-allowance syntax (same-signature entries merge).
