---
"@kekkai/blueprint": minor
---

**Action required, once: run `npx blueprint inspect --update-baseline`.**

If you have a `.blueprint-baseline.json`, this release refuses it and prints that
instruction. Re-keying records the same debt — nothing that was suppressed stops being
suppressed.

Why it has to happen: baseline identity used to include the finding's **message text**,
the one part of a finding that changes while the violation does not. Rewording any
finding silently retired every baseline entry for that rule — the old debt came back as
`fresh`, the recorded entries counted as `stale`, and a brownfield CI went red on an
upgrade that changed no code. Identity is now `rule` + `path` + `subject`, and the
message is prose the ledger keeps for whoever reads a diff.

The old baseline is refused rather than reinterpreted: read under the new key it would
match nothing, which is the wall of red the ledger exists to prevent, arriving with no
stated cause.

For `--json` consumers: every finding gains `subject` (what inside `path` the finding is
about — the import specifier, a cycle's members, empty where the rule and path already
identify it), and the baseline file is `"version": 2`.
