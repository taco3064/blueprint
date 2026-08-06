---
"@kekkai/blueprint": patch
---

**The field harness invoked codex with a flag codex had removed.** Nothing in the published package
changes; the validation ledger this release is judged from does, so it belongs in the record.

`--full-auto` became a deprecation warning and the trust check started refusing a staged temp dir
outright, so two of four scenarios in a run reported `agent exit 1 after 0.0m` — the first run in
which codex was installed at all, and the first to exercise that invocation. It now passes
`--sandbox workspace-write` (what codex's own notice names) and `--skip-git-repo-check`, because the
`new` fixture is never a git repo and a `--repo` staged by copy is not one either. Verified by
running that invocation to a clean exit.

The comment above the invocations used to read "edit here when a CLI changes its flags", which is an
acknowledgement that this breaks silently with no mechanism behind it. Each agent now declares how to
ask its CLI what it accepts, and every flag in the invocation is checked against that help before the
build — the third answer to "why can this not run here", after an unknown name and a missing binary.
Confirmed against both CLIs: the shipped flags are listed, and the `--full-auto` that lost this run is
not, so the check would have caught it before anything was spent. A `--help` that fails or prints
nothing declines rather than blocks, since an inconclusive probe proves the flags absent no more than
present.
