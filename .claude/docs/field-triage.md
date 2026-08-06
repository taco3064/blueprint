# Field runs and triage (`npm run field:run`)

**Trigger:** running the harness; triaging a `field-run` issue; writing or
rewording any prose an adopting agent reads (playbook, CLI output, contract).

## The harness

**`npm run field:run` is the live adoption harness** (`scripts/field-run.mjs`):
packs the local tree (no publish), stages scenario repos in a temp dir, runs
the adoption prompt through each available agent CLI headlessly, verifies
with the real doctor/inspect, and collects the structured feedback file into
one report — filed as a `field-run` GitHub issue, the triage inbox.
Conformance guards known scenarios; the harness hunts new ones.

`--dry` stages without spawning agents; `--repo <path>` adds the
existing-repo scenario from a local clone; `--no-issue` keeps it local.

**Triage flow:** consolidate the issue's findings, judge each (fix / by-design /
reject), put each fix through the two questions below, sweep the class before
landing, land with conformance fixtures, close the issue referencing the
commits — the closed issue is the public record of what shaped the release.

## Two questions before the wording

A finding's obvious fix is a better sentence, and that reflex is why the
authoring playbook went 152 → 877 lines in 17 days: 1133 added against 256
removed, and of the 69 commits that touched it only two ever made it shorter
(4fe2d55, 7a29e7d) — both refactors, never a field fix. Length is not the
defect. **The added sentence is where the next finding lands**, so ask two
things before writing one.

**1. Can the tool compute this?** A claim about the adopter's repo that the tool
could measure will come back however well it is worded, because the playbook
cannot see the repo it describes. "A Vite + TS starter keeps `vite.config.ts`
inside a tsconfig project, so `tsc -b` type-checks the vite edit too" was
asserted by 90301b7 (field #21–#22), reworded, and was still a finding at #99
three batches later — an agent disproved it by injecting a type error into
`vite.config.ts` (passed) against a control in `src/` (failed). The fix that
holds is a measurement, not a hedge: `hadClaudeDir` is `fs.existsSync` because
the playbook used to assert init created `.claude/`, which init knew and had not
checked. Prose is the right medium for judgment, boundaries and doctrine — not
for a fact that has an address.

**2. How many other instances are there?** Fix the class, not the paragraph.
8bd4aec is the shape to copy: it closed one finding, then swept and said so —
"this is the only universal claim about the adopter's repo shape in any output"
— and closed two more classes the same way in the same pass. A per-paragraph
patch leaves the generator running, which is why weeks of them did not lower the
per-run finding count.

Two shapes recur, and both are prose doing a program's job. **Enumerating
combinations**: naming all four ignore-rule × version-control states still left
one cell undecided, and three consecutive runs called it a coin flip (8bd4aec).
**The same passage written twice**: the `--print-config` caveats had drifted into
four paraphrases, and `git blame` shows two commits editing *both* copies in one
pass — the shape was at fault, not the care taken. That one is now
`printConfigCaveats`, one text at two indents.

Then record the verdict where the next person meets it — the source, not the
commit message. Same argument as the survivor proofs in
[`mutation-testing.md`](./mutation-testing.md): a judgement in a commit message
serves the review and afterwards has to be excavated with `git log -S`.

## Not a diverging loop

Worth stating so the numbers above are not over-read. The finding rate is not
climbing: three of the four #99/#100 scenarios reported no blocking item, and
withdrawn-on-investigation entries are rising, which is the playbook preempting
doubt. What the numbers show is that growth is one-directional and the added
prose is where later findings land. That is a fix-policy question, not a length
one — which is why this page leads with the two questions rather than a budget.
