---
"@kekkai/blueprint": patch
---

**The agent contract and the handbook stop calling an unemittable gate machine-held.** The
contract listed every `error`-tier rule among the ones that "fail the project's lint run",
and the handbook's Enforced-by column said `lint` — both for gates the emitted config does
not contain: `deepWatch` declared on React, `testFilename` declared beside
`testFiles: []`. #137 swept `blueprint rules` and `inspect`'s denominator for exactly this;
these two are the third and fourth site, and they are the files an adopting agent reads
every day.

Both arms are decidable from the blueprint alone, which is all these emitters have — so
`unavailableFromBlueprint` answers with what a blueprint can settle and deliberately never
claims `explicitAny` is unavailable, because whether the stack has TypeScript is not in a
blueprint. The contract drops such a gate from the lint list; the handbook keeps the row
(the declaration is the author's) and replaces the machine with the reason nothing holds
it.

**`doctor`'s red banner counts the skips riding under it.** `✗ Adoption incomplete — 2 of
7 check(s) failed` was the whole line while the JSON said `skipped: 1`. An agent reads the
banner and stops, so fixing the ✗ would have handed it a green it was never told was
partly unproven.

**And the merge-survival check's not-wired skip drops both words.** `merged` is
`ownedEslintConfig === undefined`, which a repo with **no** eslint config satisfies — so
that arm said "the merged eslint config" about a repo where nothing was merged and nothing
was generated either. It says "the eslint config" there, which is the only version that
stays true.
