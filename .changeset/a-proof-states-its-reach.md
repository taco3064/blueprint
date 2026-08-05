---
"@kekkai/blueprint": patch
---

**Three clauses in the authoring playbook, all about a step whose reach was left to the
reader.**

**A green build says what it proves.** The checklist asks for one `npm run build` because
doctor reads the alias wiring as text and never compiles it. The sentence directly above
carries the matching caveat for the lint run — on a repo whose layers hold no files, a
green lint proves only that the config parses. The build sentence did not, and the
downgrade is identical: with nothing importing through the alias, a green build proves the
`tsconfig`/`vite` edits parse and compile, not that the alias resolves. A field agent
worked that out on its own and pointed at the asymmetry between two adjacent sentences.
Still worth running — it catches an edit that broke the config outright — and now the
playbook says which of the two answers a green means.

**How to combine, when the emitted block is an opaque spread.** "Combine both option sets
into ONE entry" described the destination and not the route: `...emitLint(blueprint)`
cannot be edited from outside, so there is no emitted entry to fold your rule into. An
agent derived the answer, verified it with `--print-config`, and reported that the
playbook never states it: write the combined entry yourself and place it AFTER the spread,
using the same later-replaces-earlier property the paragraph opens by warning about. Which
is why it must carry everything the emitted entry did — both option sets, the emitted
`ignores`, and the same file scope. Wider imposes your rule on layers it never governed;
narrower leaves the dropped layers with nothing, silently.

**A repo under no version control at all.** The build-artifact branch stopped at "does the
repo have ignore rules". Five separate runs reasoned out the case below that — no VCS,
where nothing is tracked and "untracked" describes every file — and each spent a paragraph
arriving where the guidance already pointed. Now stated in the branch itself.
