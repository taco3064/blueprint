---
"@kekkai/blueprint": minor
---

**The baseline is keyed on the violation, not on the sentence — and an existing
baseline must be regenerated once.** `Finding` gains a `subject` field: what inside
`path` the finding is about (the import specifier, a cycle's members, `''` where the
rule and path already identify it). Baseline identity is now `rule` + `path` +
`subject`, and `message` is prose the ledger records for the reader of a diff and
never reads back.

Identity used to include the message text, which is the one part of a finding that
changes while the violation does not. Rewording a finding — this repo's most frequent
kind of commit — silently retired every baseline entry for that rule: the old debt
came back as `fresh`, the recorded entry counted as `stale`, and a brownfield CI went
red on an upgrade that changed no code.

**Action required on upgrade, once:** run `npx blueprint inspect --update-baseline`.
A baseline recorded under the old key is refused with that instruction rather than
reinterpreted — read under the new key it would match nothing, which is the wall of
red the ledger exists to prevent, arriving with no stated cause. Re-keying records
the same debt; nothing is suppressed that was not suppressed before.

`--json` consumers see `subject` on every finding, and the baseline file is now
`"version": 2`.
