---
"@kekkai/blueprint": patch
---

**The playbook's `--print-config` caveats are one text again, and the early-exit path gets the
newer wording.** The four facts that make a *correct* resolved config look broken — resolved
keys carry their plugin prefix; a rule scoped to an empty layer does not appear at all;
selfOnly's re-export ban resolves on the importer layer; inspect's finding names are not ESLint
rule ids — are needed on both paths that reach `npx eslint --print-config`: the early-exit
checklist's lint step and the merge step of Method 9. They were written out at each site, and
the two copies had drifted into four different paraphrases of the same four facts. Nothing was
misleading, but each site was one edit away from becoming so: two commits in the release history
touched *both* copies in a single pass and still produced paraphrases, which is what
hand-copying does regardless of how carefully it is done. Both sites now render from one source,
each keeping only its own opening sentence — the framing genuinely differs there, the facts do
not. On the below-threshold (early-exit) playbook the wording therefore changes to the merge
step's, which two later fixes had already improved; the merge step's own text is unchanged, and
so is every above-threshold playbook.

Nothing about what the tool checks or emits elsewhere moved, and no config field or command
changed — this is the playbook text an adopting agent reads.
