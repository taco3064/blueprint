---
'@kekkai/blueprint': patch
---

The survey's "Same-folder imports via the alias" count is now stated for
what it is — a textual upper bound, not a promise (field issue #11: the
playbook called it "exactly how many errors the wiring will introduce",
and a 489-file field repo proved it 5 ≠ 0 against `impact`). The count
includes test files (exempt in the emitted config) and non-static
references (dynamic imports, mock specifiers, doc comments) the wired
rules may never flag. Both the playbook's pre-wiring check and the survey
heading now say so and point at `impact` for the real per-rule number.
