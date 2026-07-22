---
"@kekkai/blueprint": minor
---

Field issues #7–#8: `blueprint rules` gains the resolved per-layer view —
what each layer may not import, which owned packages (down to named imports)
and globals are banned there — ending the `eslint --print-config`
archaeology behind "0 hits: wired-and-clean, or not applying at all?". The
playbook's early-exit verdict becomes a complete self-contained checklist
("following this verdict IS executing the playbook fully"; impact's zero
gates the suppress-all run; trivially-true acceptance gates are named as
such; the now-empty command directory goes too), the config schema's full
`owns`/`additionalAliases` shapes live in the playbook so nothing exists
only in dist, the test-file exemption is named as a deliberate relaxation
versus tools that police tests, and a below-threshold `--authoring` run
says up front that the playbook's own verdict will be the early exit. All
adoption prompts state that an early exit the playbook prescribes counts
as full execution.
