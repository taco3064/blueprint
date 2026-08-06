---
"@kekkai/blueprint": patch
---

**Two sentences about the same artifact cell disagreed, and a field agent quoted both.** The
playbook says a `.gitignore` listing `dist` in a tree that is not a git repo is "a rule with
nothing to enforce it" — then groups that same cell under "leave the artifacts alone, ignore rules
cover them". Read together they contradict, and the agent landed in exactly that cell. It withdrew
the item only because `tsc -b` had written its `tsbuildinfo` into `node_modules/.tmp` and it never
reached the decision.

The reconciliation is **declared against enforced**. A dormant `.gitignore` line enforces nothing
today and is still the repo author writing down that this artifact is disposable — a declaration
that takes effect the moment anyone runs `git init`. That is what leaving the artifact rests on.
The cell that decides itself is the one with no declaration anywhere: no rule to go dormant, no
history to surface the file, nothing but the adopting agent's report.

**The refusal that protects a hand-written config now says where the rescued comments go back
to.** `init --authoring` refuses to re-author a config it did not scaffold, and names what is
actually lost: the structure comes back, the comments explaining why each threshold and ownership
was chosen do not. It then said "copy anything you want to keep" and stopped — so an agent that
did the right thing, putting them back beside the clauses they explain in the rewritten config,
recorded that as its own invention because nothing in the tool had a stance. Saving that rationale
is the guard's entire purpose, and the destination is now part of it: back into the config, each
comment beside its clause, not only into a report that is read once while the config is what the
next re-authoring will read.
