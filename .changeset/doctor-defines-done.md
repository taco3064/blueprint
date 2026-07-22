---
'@kekkai/blueprint': minor
---

`doctor` and the playbook now define "done" identically (field issue #13):
the leftover-files check also flags `blueprint-authoring.md` and
`.claude/commands/blueprint-author.md` — "Adoption complete" over a live
playbook was a second, contradicting authority, and a careless agent
stopped there. The check's detail says a mid-authoring doctor run is
EXPECTED to fail on it; the early-exit checklist and acceptance gates now
order cleanup BEFORE the final doctor run. Gate turns stricter: repos
that finished wiring but skipped the playbook's cleanup step go red until
the two files are deleted.

Also: the `missing-layer` note carries the keep-is-default verdict in
place ("runway, not a todo … slimming is the owner's call") — six of
these read as a todo list and pointed an agent at dismantling the preset
skeleton the playbook says to keep.
