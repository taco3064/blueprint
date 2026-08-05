---
"@kekkai/blueprint": patch
---

**Two instances of already-fixed problems, found by sweeping rather than by waiting for a
field run to land on them.** Each field batch had been triaged one report at a time, which
means each round rediscovered a class the previous round had already fixed elsewhere. These
two came from re-reading #71–#84 as classes and checking every artifact against each.

**The handbook states its reach, as the contract now does.** Two field agents raised this
about `CLAUDE.md` — that every CLI surface marks a net over an empty repo as vacuous while
the contract said only "machine-enforced". They raised it about `CLAUDE.md` because that is
the file they read. The handbook is the other durable artifact, the one the contract links
to for every placement decision, and it said nothing about the net possibly being empty
either. Its rules table now closes with reach: every row reaches only the files a layer
glob matches, a declared layer holding no code has nothing that can fail, and
`blueprint doctor` reports which of the two the repo has today. Stated glob-relative
rather than as a count, because the handbook is generated from the blueprint alone and
cannot see the repo.

**The merge instruct says an entry is more than its selectors.** `init` writes
`eslint.config.blueprint.mjs` whenever the repo already has an eslint config, and the
adopter has to fold it in. Both merge shapes already said "combine rules both sides set
into ONE entry" — the half of that job which fails loudly. The half that fails silently is
the `ignores`: every structural entry exempts test files, a rebuilt entry has none unless
you write one, and doctor compares selectors rather than scope, so a missing exemption
stays green while governing test files it was never meant to reach. That guidance existed —
in the authoring playbook, which the preset path never writes. A field run had already lost
a debug cycle to it (34 errors in one test file) on the path that does get the playbook.

Both are the same shape as the fix in this release for `codeStyle`: guidance that reached
only the path which did not need it.
