---
"@kekkai/blueprint": patch
---

**The field harness scored an unverified adoption as green, and printed a footnote where the verdict
belongs.** Nothing in the published package changes; the ledger this release is judged from does.

Giving `doctor` a third outcome broke two places that only knew about two. The report's verdict line
matched `^[✓✗] Adoption`, so a `⊘ Adoption unverified` banner missed and the fallback printed the
version-control note instead — the exact failure the comment above that line records from an earlier
batch, one marker later. And the issue title counted a scenario green on doctor's exit status, which
is 0 for a skip by design: one run reported `doctor 4/4 green` while the check that proves the gates
are wired had never run in one of them.

The verdict line now anchors on the word rather than on a list of markers, so a fourth marker would
still match. The title reads the banner instead of the exit code and names unverified scenarios
separately from green ones. Both verified against the exact output of the run that exposed them.

Worth recording plainly: this is the harness making the mistake it exists to catch, about the tool in
which that mistake was just fixed.
