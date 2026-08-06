---
"@kekkai/blueprint": minor
---

**`doctor` counted a check that could not run as a check that passed.** The merge-survival check —
the only one that proves the emitted rules are alive in your resolved config — skips rather than
fails when the merged config will not resolve, because a red nobody can appease is worse than no
check. What it did not do was keep that skip out of the pass count, so the output read `✓ … (skipped
— could not resolve the merged config)` above `✓ Adoption complete — all 7 checks passed.`

A field agent hit exactly that, did not believe it, and spent ten minutes with `impact`, the
project's own lint and `eslint --print-config` establishing that the one check proving the gates are
wired had never run. Reading only doctor, the available conclusion was that the lint wiring had been
verified.

A skip is now its own outcome: `⊘` on the line rather than `✓`, the consequence and the next step
under it, and a banner that says `⊘ Adoption unverified — 6 of 7 checks passed, 1 could not run`
instead of claiming all seven. `DoctorCheck` carries `skipped` structurally, so `--json` sees it too
— automation reading that channel must not learn less than a reader. Exit status is unchanged: a
skip is not a failure, and the JSON field is a more precise signal for a script than an exit code
would be.

One skip deliberately stays a plain pass: no layer holding a file means there was nothing to verify,
which doctor already reports in the same breath as vacuous, "a green gate proves nothing yet".
Marking that one too would relabel every greenfield scaffold as unverified on the strength of a fact
already on screen. The rule is to mark a skip when it hides something the rest of doctor does not
already say.

Everything that tells you to run doctor now describes all three outcomes rather than two. The
authoring playbook's early-exit step, its acceptance gate and its semantics list each say what a `⊘`
means and that it keeps exit 0; `doctor --help` names it too, and points a gate at `--json`'s
`skipped` instead of the exit code it invites you to read.

This project's own fixtures were resting on the miscount: several asserted "all 7 checks passed" in
`--no-install` repos where eslint cannot resolve, so the suite had been green through the same
skipped check.
