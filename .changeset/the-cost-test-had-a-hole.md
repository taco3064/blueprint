---
"@kekkai/blueprint": patch
---

**The field harness's own prompt let a false statement slip through its filter.** Reports gate the
blocked section on real cost — how long you were stuck, what you decided wrongly, what internals
you were forced to read — and that filter is right for friction. It is wrong for a claim that is
simply untrue: cost is a property of the run, not of the tool, so the same false sentence reaches
the next adopter who does pay for it.

It happened twice in one release. An agent hit an assertion about tsconfig layout that was false
for its repo and withdrew it because the next clause hedged. Another quoted two sentences of the
artifact guidance that contradict each other and withdrew it because a build artifact happened to
land somewhere that meant the decision never came up. Both were real defects, both were filtered
out by the cost test, and both were recovered by hand afterwards.

The prompt now carves those two out: a statement that does not match reality, or a passage that
contradicts itself, is reported regardless of whether this run paid for it — with the check that
showed it, since a verification is the most useful part of such a report. Anything that merely
reads oddly, unverified, still belongs in the handed-back section. `.claude/docs/field-triage.md`
carries the triage side of the same split, so the criterion lives in the repo rather than in
whoever is triaging.
