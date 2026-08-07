---
"@kekkai/blueprint": patch
---

**What this release moved, and what it did not.** Worth stating plainly, because most of the
entries below act on one axis and it is not the obvious one.

**Adoption did not get more likely to succeed, because it was already succeeding.** Every
entry here came out of live adoption runs — a real agent CLI taking a real repo through
`init` → `inspect` → `impact` → `doctor` — and across every one of those runs `doctor`
finished green. It finished green before these fixes too. Nothing here rescues a failing
adoption.

**What moved is whether an adopting agent reaches a true conclusion and writes it into its
report.** That is the axis: output an agent reads and acts on, where a confident sentence the
tool could not back turns into a claim in a handoff nobody re-checks. One measured example —
the build step used to assert that `tsc -b` type-checks your vite config edit; an agent
disproved it by injecting a type error there, and the next run's agent reported that the
rewritten passage stopped it from claiming an alias edit it had not verified.

**Six were the tool doing the wrong thing rather than explaining itself badly**, and those
are the ones to read first if you skim: an overwritten hand-written contract, a config path
reaching outside the repo, an interrupted install stranding the alias, `testFiles: []`
emitting a config ESLint refuses, `impact` demanding a plugin no gate would use, and a CRLF
tsconfig silently skipping the alias edit.

**The largest change to how hard this is to break is not in this changelog.** Mutation
testing arrived after 3.0.0 — that tag has no `stryker.conf.json` — and the suite roughly
doubled under it. Most of that found places where a wrong edit to the source would have
shipped with every test green. It produced no behaviour you can see, so it has no entry, and
it is still the reason this version is sturdier than the last.

**And the honest bound:** the wording fixes are reasoned, not measured. Several of them
repaired sentences this project had written one or two releases earlier, and those net close
to nothing — they closed gaps their predecessors opened. The per-item paper trail for all of
it, including what was judged not worth fixing and why, is in this repo's closed `field-run`
issues rather than here.
