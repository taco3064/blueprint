---
"@kekkai/blueprint": patch
---

**Runway comes in three shapes and the playbook claimed `inspect` tracked all of them.**
"Declared-but-empty layers (and an alias no import uses yet) are the runway … `inspect` tracks
it honestly" was true of exactly one: `analyze` raises `undeclared-folder`, `missing-layer`,
`declaratory-self-only` and `no-entry` — nothing for an alias no import uses, and nothing for
an `owns` entry naming a package the repo has not installed. A field agent met the third (a
preset's `hooks` owns `zustand`, which its repo does not depend on) and had no way to tell
forward-looking runway from preset over-declaration. All three are named now, with the two
that raise no finding marked as the runway you have to recognize yourself.

**A cross-layer detector swap is not the same decision as dropping a duplicate rule.** For one
semantic covered twice, the playbook said "pick one detector and record it (the catalog's perf
note usually argues for the inspect side)" — which reads as a free choice. Two field runs
derived the missing half independently: two lint rules for one semantic are a pure duplicate
and dropping either changes nobody's workflow, but dropping a lint-time `import/no-cycle` in
favour of blueprint's `cycles` gate moves interception off whatever runs lint — a pre-commit
hook, an editor, a CI step — and onto `inspect`, which may be wired into none of them yet. That
is the adopter's pipeline, so the guidance now says to declare the gate only when also placing
`inspect` where the lint rule used to fire, and otherwise to recommend the consolidation in the
report with that cost named.

**"Copy these selectors verbatim" now says why, where the copying happens.** doctor's
comparison is textual, and `doctor` says so — in the failure detail, which a correct merge never
sees. An adopter deciding how to write an escape (`\/` for the emitted `/` — the same string at
runtime) could not tell whether a respelling would read as missing, and over-constrained
defensively to be safe. The caveat now heads `blueprint rules`' per-layer ban block, covering
both the pattern groups and the selfOnly selectors it prints for folding.
