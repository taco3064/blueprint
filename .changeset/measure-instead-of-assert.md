---
"@kekkai/blueprint": minor
---

**Which build to run is now measured from your tsconfig, not argued about in prose.**
`init --authoring` reads the tsconfig graph — the root config plus the projects it references —
and the playbook states the answer: either `npx tsc -b` alone, naming the config that pulls your
vite config in, or `tsc -b` and the vite build separately, naming the config it read and finding
nothing. Where the graph carries a shape the reader will not resolve (an `exclude` list, an
`extends` base, a brace or character-class glob) it declines and the previous read-your-tsconfig
wording stands, saying outright that this run could not settle it. A wrong verdict here is worse
than none, because the whole point of the step is that a report must never claim a build verified
an edit it never read.

This closes a generator rather than a finding. The same paragraph was rewritten in three
consecutive releases: first it asserted that a Vite + TS starter keeps `vite.config.ts` inside a
tsconfig project — false on the shape this repo's own harness stages, and a field agent disproved
it by injecting a type error there against a control in `src/`. Then it told the agent to go and
read the tsconfig, which was correct and grew a conditional premise one release later, and a fused
attribution problem the release after. Every one of those findings landed in that one paragraph,
which is what a passage doing a program's job looks like. `hadClaudeDir` was the same move
earlier: a claim about the adopter's repo became `fs.existsSync` and stopped coming back.

Two lines went the other way while it was being written, and both are worth naming: a glob helper
carried a bare-directory branch and an exact-match fast path that could not decide anything for
the one caller that exists — the file asked about is always a root file — and each was a mutant no
test could honestly kill. Deleting them was the fix. `viteTsCoverage` is exported from the package
entry, so a consumer can ask the same question directly.
