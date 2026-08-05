---
"@kekkai/blueprint": minor
---

**Three things the output left to the reader, all found by the same field run.** Every
adoption completed green — no agent was blocked, gave a wrong answer, or had to
reverse-engineer anything. What they reported instead was the last thing each of them
had to decide alone, and three of those were the output's job.

**`doctor` names the uncommitted working tree under its own green banner.** The
authoring playbook says a ratchet that lives only in an uncommitted tree is not
installed. Doctor — the last thing on screen, and often the only thing still in an
adopting agent's context — said "Adoption complete — all 7 checks passed" and nothing
else. Three agents closed on that gap independently, one of them writing that what it
had reported as complete was "complete minus commit". A repo with no `.git` now reads:

```
✓ Adoption complete — all 7 checks passed.
  Not a version-controlled repo, so nothing adoption wrote is committed — and a
  ratchet that lives only in an uncommitted working tree is not installed: the next
  clone starts without it and CI has nothing to run. Initialise version control and
  commit these files to finish. Doing that is the owner's call, never an adopting
  agent's.
```

Only the no-VCS case: whether a git repo's own tree is clean needs `git status`, and
doctor is read-only with zero dependencies. It rides under the banner rather than as an
eighth check, because it cannot fail — and a check that is always green would push the
count every conformance fixture states. It reaches the `--json` channel too; two
channels reporting one run must not know different things.

**`doctor`'s survival check says its comparison is textual.** An agent hand-merging a
`no-restricted-syntax` entry reproduced blueprint's exact `/` escaping "defensively"
and could not tell whether it had to. It did — the check is string containment — so a
selector rewritten to an equivalent spelling reads as lost here while eslint enforces
it perfectly. The failure now says so, and says to copy the emitted text rather than
retype it.

**The authoring playbook owns the build it asks for.** It requires one `npm run build`
to prove the alias really resolves (doctor reads the wiring as text, never as a
compile), which leaves `dist/` and `*.tsbuildinfo` untracked in someone's working tree.
"Leave them to the repo's own ignore rules" reads as "you may not touch these", and all
three agents named the same discomfort: the step that created the files did not say
whether keeping them was appropriate. It now says removal is safe — nothing adoption
wrote depends on them and the build can be re-run — and that the choice is the owner's.

Judged by-design and unchanged: the tool trusting an agent's self-report for
`emit.agents` (nothing can verify which agent is running it, and a wrong contract file
is caught by doctor's stale-contract check on the next run), the preset choosing a
layer taxonomy the adopting agent may not slim, and every brownfield judgment call the
playbook deliberately hands to the maintainer.
