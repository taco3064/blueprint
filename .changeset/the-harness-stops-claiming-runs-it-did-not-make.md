---
"@kekkai/blueprint": patch
---

**The field harness reported an adoption it had not performed.** Nothing in the published package
changes; what changes is the validation ledger this release is judged from, so it belongs in the
record.

Three runs were launched from inside a Claude Code session, where the agent CLI refuses to start
nested. Every scenario read `agent exit 1 after 0.0m` — and the harness filed all three as
triage-inbox issues anyway. One was worse than empty: the staged repo was cloned from a project that
already carries a committed adoption, so `doctor` went green on the *prior* config and the report
announced "Adoption complete — all 7 checks passed" beside an agent that never launched. That is the
harness making the mistake it exists to catch, on itself.

- The launch precondition is checked beside `--repo`, before the build and pack, and names both ways
  out instead of failing eight minutes later.
- A run where no scenario produced feedback files nothing: it measured the machine, not the tree. A
  partial failure still files, because the report carries the failing agent's log tail — which is how
  an 81-byte `API Error` once survived its temp directory.
- A `--repo` staged from an already-adopted project has its doctor verdict labelled with whose work
  it covers, and the title counts only scenarios that produced evidence, naming the silent ones
  rather than scoring them. The re-adoption path stays: it is where the last two batches found their
  real defects.
