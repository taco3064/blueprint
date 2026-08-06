# Field runs and triage (`npm run field:run`)

**Trigger:** running the harness; triaging a `field-run` issue; writing or
rewording any prose an adopting agent reads (playbook, CLI output, contract);
cutting a release.

## The harness

**`npm run field:run` is the live adoption harness** (`scripts/field-run.mjs`):
packs the local tree (no publish), stages scenario repos in a temp dir, runs
the adoption prompt through each available agent CLI headlessly, verifies
with the real doctor/inspect, and collects the structured feedback file into
one report — filed as a `field-run` GitHub issue, the triage inbox.
Conformance guards known scenarios; the harness hunts new ones.

`--dry` stages without spawning agents; `--repo <path>` adds the
existing-repo scenario from a local clone; `--no-issue` keeps it local.

Three things it will not do, each because it did them once:

- **It refuses to start from inside a Claude Code session.** The agent CLI will
  not launch nested, and the refusal used to arrive after a build, a pack and one
  install per scenario. Checked with `--repo`, before any expensive work — run
  the harness from a plain shell.
- **No feedback anywhere means no issue.** A run whose scenarios all failed to
  produce a feedback file tested the machine, not the tree; three such reports
  went into the inbox and had to be deleted. A *partial* failure still files, so
  the report keeps the failing agent's log tail.
- **On a `--repo` that arrives already adopted, doctor's green is labelled.**
  It is verifying a config the run did not necessarily write, and when the agent
  did not finish the row says outright that the verdict belongs to the prior
  config. **This is not a reason to drop such a repo** — the re-adoption path is
  where the last two batches found their real defects. It is a reason to say what
  the green covers.

**Triage flow:** consolidate the issue's findings, judge each (fix / by-design /
reject), put each fix through the two questions below, sweep the class before
landing, land with conformance fixtures, close the issue referencing the
commits — the closed issue is the public record of what shaped the release.

## Only one section is a defect queue

The feedback file has three sections and they are not the same kind of thing.

**卡到的 is the defect queue.** An entry there cost the agent something real —
blocked time, a wrong decision, an internal it had to reverse-engineer. A
non-empty one is the signal that gates a release.

**拿不準的 is the paper trail, and reading it as a queue is how the generator
above gets fed.** It records decisions the agent made that the tool did not make
for it — and a governance tool is *supposed* to hand architecture decisions back,
so most entries are the product working. `scripts/field-prompt.md` asks the agent
to mark each one, because the agent is the only one who knows which it was:

- **有立場, 我照做** — the tool stated a stance and the agent followed it. Not a
  gap. It belongs in the release notes' "what the owner still decides" list, not
  in a fix list. Fixing these is what turns one finding into the next one's
  landing site.
- **沒立場, 我自己發明** — the tool had no stance and the agent invented one.
  This is a candidate defect. Still put it through the two questions: a stance
  that is *absent* is answered with a sentence, and a sentence is the generator.
  Fix it when the item names prose that is **wrong**, or a fact the tool could
  **measure**. Record and close it when the remedy is only one more paragraph.

An older report with an unmarked 拿不準的 section has to be sorted by hand, which
is the sorting the prompt now front-loads.

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

## What the counts actually did

Measured over #95–#107, nine issues and eighteen scenarios:

- **17 of 18 reported nothing under 卡到的.** The exception is #99's new×claude
  and it is the `tsc -b` universal in question 1 above.
- **拿不準的 held flat at 6–9 per issue** — 2, 2, 9, 5, 6, 9, 6, 8, 7. No trend,
  and there should not be one: that section is the product.
- **5 of the last 12 fixes repaired this project's own earlier sentences.** The
  `tsc -b` universal and the four-cell artifact table each came back one batch
  after being written; broadening "mentioned" to include a diagram narrowed the
  stale branch and left a third state unowned, which is #107.

So the loop was not diverging — it was *fed*, by triaging the paper trail as a
queue. The stopping rule follows from the split above: a non-empty 卡到的 gates
the release; a 拿不準的 entry is answered in the issue thread unless it names
wrong prose or a measurable fact. Withdrawn-on-investigation entries are rising
across the same window, which is the playbook preempting doubt, and they are the
number worth watching go up.

A release still needs a run: the prose an agent will *follow* — an instruction,
not a caveat — is the highest-risk kind, and every second-order finding above
came from one. Merge, run once, judge by the split, ship.

## Cutting it

`.github/workflows/release.yml` does everything from a pushed tag — gate, build,
`npm publish --provenance`, and the GitHub Release, whose notes are that
version's `CHANGELOG.md` section verbatim via `scripts/changelog-section.mjs`.
So the whole manual part is `npx changeset version`, commit, tag, push the tag.

Those four steps do not need memorising: the workflow refuses a tag whose semver
does not match `package.json`, a release commit that did not touch
`CHANGELOG.md`, and any leftover `.changeset/*.md`. The last two print the
command that fixes them; the version-mismatch one states both numbers and leaves
the fix to you, which is fair — either the tag or the bump is wrong and it cannot
know which. Skipping a step is a named failure, not a bad publish.

**One step has no gate behind it: the release-framing entry has to be hoisted.**
Changesets concatenates entries under Minor/Patch headings in no useful order,
and this repo writes one entry per release that frames the whole thing — which
axis moved, which did not, what is measured against inferred. Buried at position
seven of nineteen it is just another bullet. After `changeset version`, move it
to the top of that version's section, before the `### Minor Changes` heading. One
edit covers both channels, because the release notes are the section.

Two things the workflow deliberately will not do. A GitHub Release that already
exists is left alone — a hand-written one outranks the generated notes, so
re-pushing a tag never overwrites an edit made after the fact. And nothing here
runs the mutation sweep or the field harness; both are `workflow_dispatch` or
local by design, for the reasons in [`mutation-testing.md`](./mutation-testing.md)
and above.
