---
"@kekkai/blueprint": patch
---

**The build preference says it is conditional, and the step that asks for attribution says
how to get it.** "On this path prefer `npx tsc -b` … the full `npm run build` answers no more
of it" stated a flat preference on a conditional premise: the full build answers no more only
where `vite.config.ts` sits inside a tsconfig project. Outside every project it answers
strictly more, because it is the only build that reads that file. Two field runs landed on the
sentence — one deviated from it, one nearly filed it and withdrew because the next paragraph
self-corrects. A sentence whose correctness depends on the reader continuing past it is doing
half its job, so the premise now travels with the preference. And on that branch the step's own
closing ask — report which of the two proofs you got — is unanswerable from one fused result:
`tsc -b` then `vite build` covers what the full build covers and is the only form that can
attribute each edit to the build that verified it. The playbook names the split instead of
leaving an agent to invent it and label it a deviation.

**`tsc -b` writes a `*.tsbuildinfo` even under `noEmit: true`, and the playbook says so.** The
artifact line named the file as normal build output; the paragraph two sentences earlier sends
the agent into its tsconfig, where `noEmit: true` is sitting. A file appearing anyway reads as
the build overriding the config. It is build mode's book-keeping of what it already checked,
not emitted program output — the settings do not conflict, and the file is safe to delete.

**"Your own verification step" is narrower than "untracked", and the cleanup cell now sorts the
three kinds.** In a tree with no ignore rules and no version control, nothing else marks the
difference — and `init` installs `node_modules/` and rewrites a lockfile, which are exactly as
untracked as `dist/`. Three kinds end up untracked and only the first is yours to remove: what a
verification command produced; what `init` produced, install included, which is the adoption
itself; and whatever was already in the tree before you started. Deciding by "is it untracked?"
deletes the deliverable; deciding by "did I run the command that made it?" does not.

**The stale-vs-runway tiebreak names the third state its own diagram rule opened up.** The
previous release taught it that a layer drawn in an intent document's flow graph has been
mentioned — which removed the stale branch's trigger without widening the runway branch's, and
left "mentioned, but nowhere described as intent" belonging to neither. That is the common case,
and the one a field agent landed in: a layer drawn in a mermaid graph, described in no
per-layer section, its code living somewhere else entirely. Two agents reached the right answer
through the keep-is-default fallback and both said reading the prose alone was a tightrope. The
two branches are not a partition, so the middle is named: keep it, and hand the owner the
specific question — drawn here, described nowhere, code at that other path — because the owner
knows which of the two the drawing meant and an adopting agent does not.

**Two proof steps in emitted output now state their reach, the way the playbook's already did.**
The emitted eslint reference said "Your own lint passing on .ts/.tsx confirms it" — true as far
as the files it parsed, and on a repo whose layers hold no files that green proves the config
loads, not that the parser reaches layer files. And doctor's survival-check ✓ named three things
it does not compare without naming that it resolves **one path per layer**: a merged entry that
replaces blueprint's on part of a layer passes, because the probe lands on a sibling that still
carries the emitted selectors. `pickProbes` called that out in a source comment; the adopter
reading the ✓ never saw it.
