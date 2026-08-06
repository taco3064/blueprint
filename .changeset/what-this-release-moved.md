---
"@kekkai/blueprint": patch
---

**What this release moved, and what it did not.** Seventeen entries below are fixes to output an
adopting agent reads, so it is worth saying plainly which axis they act on — and which one they
leave alone.

**Adoption completion did not improve, because it was already at ceiling.** Across the eighteen
live adoption scenarios that produced these entries, `doctor` finished green in eighteen. It was
green before them too. Nothing here makes adoption more likely to succeed; the tool was not
failing.

**The largest stability change in this release is not in this changelog.** Mutation testing
arrived after 3.0.0 shipped — that tag has no `stryker.conf.json` — and the suite went from 696
tests to 1160 under it. Surviving mutants went 87 on the first sweep, 59 on the second, 17 now.
The load-bearing number is inside that middle figure: of those 59, **43 turned out to be untested
rather than equivalent** — 43 places where a wrong edit to `src/` would have shipped with the
suite green. None of that produced an adopter-visible change, so none of it has an entry below.
It is still the reason this version is harder to break than 3.0.0.

**Six defects were the tool doing the wrong thing rather than explaining itself badly**, and
three of the six came out of that sweep rather than out of a test: `init` overwriting a
hand-written contract whose path does not end in `.md` (destructive, and no test was positioned
to see it), `doctor` and `init` misdirecting on an unreadable tsconfig, and `/*/` read as a
closed comment. Beside them: two CRLF paths, and the scan's order settled at the scan instead of
inherited from `readdirSync`, which is the difference between one output and one output per
filesystem.

**The remaining entries act on a narrower axis: an adopting agent reaching a false conclusion
and writing it into its report.** There is one measured save. The build step used to assert that
a Vite + TS starter keeps `vite.config.ts` inside a tsconfig project, so `tsc -b` type-checks the
vite edit — false on the starter shape this project's own harness stages, and an agent proved it
by injecting a type error there against a control in `src/`. Rewritten as a check ("read it, do
not assume it"), the next run's agent reported that the passage stopped it from claiming a
verified alias edit it had not verified, and the run after that exercised the other branch and
confirmed the tsconfig by opening it. Both arms, one measurement each.

The honest bound on the rest: they are reasoned, not measured, and five of the last twelve
repaired sentences this project had written one or two batches earlier. Those five net close to
nothing — they closed gaps their predecessors opened. That pattern is why the triage criterion
tightened in this window: a finding that cost an agent something gates a release, and a decision
the tool handed over on purpose is recorded rather than answered with another paragraph.
