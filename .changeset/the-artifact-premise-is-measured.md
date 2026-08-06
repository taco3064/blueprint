---
"@kekkai/blueprint": minor
---

**The playbook told you to report untracked build artifacts on a repo where the build writes none.**
The artifact hand-over opens on a premise about your repo — *"a step THIS playbook asked for produced
untracked files in someone's working tree"* — and the four gitignore × version-control cells below it
exist to decide what to do with them. That premise is false on the shape `npm create vite` generates
for React + TS: both projects carry `noEmit: true` **and** a `tsBuildInfoFile` under
`node_modules/`, so `tsc -b` leaves the working tree exactly as it found it. An agent following the
instruction writes a sentence about files that do not exist.

A field agent caught it for about the cost of one `ls`, and reported it anyway — the check is not
whether this run paid, it is whether the next reader gets a true sentence. Two of the repos this
project field-tests on are that template.

`init --authoring` now reads the tsconfig graph and says which it is. Where every project provably
keeps its build info out of the tree, the paragraph states that with the path and the config that
declares it, and points the four cells at the only artifact left — the bundle, and only if you ran
the vite build. Everywhere else the previous wording stands, because there it is right: a repo whose
build does write into the tree still has all four cells to consider.

Third time this family of sentences has been wrong about an adopter's tsconfig, and the same answer
as the second (`viteTsCoverage`, which replaced three releases of prose about which build reads the
vite config): a claim with an address gets measured, not reworded. It declines unless certain —
"something landed" is what the existing text already assumes, so this never has to prove it.
`tscArtifactsOutOfTree` is exported from the package entry.
