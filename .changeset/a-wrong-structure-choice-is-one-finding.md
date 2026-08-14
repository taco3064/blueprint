---
"@kekkai/blueprint": minor
---

**A wrong `structure` choice now reports as one finding instead of N that each recommend
the opposite.** A flat tree under `structure: 'modular'` printed three `undeclared-module`
errors and two `missing-module` notes — every one of them correct about itself, and none
of them in a position to see that *three of three* top folders were undeclared *while*
*two of two* declared modules were absent. Followed one at a time, they instruct an
adopter to declare `components`, `hooks` and `services` as modules: a config that is
green, and a module list that is only a copy of the folder names on disk. The mirror
behaves the same way — a modular tree under a flat preset is told to declare its domain
folders as layers.

`inspect` now emits `structure-mismatch` when every top-level source folder is undeclared
**and** every declared position is absent, in both directions. It is an `error`, it lands
on line one above the findings it is built from, and it names them as its evidence rather
than adding a sixth opinion. The per-folder findings all stay — suppressing them would
hide what the bridge is derived from.

The message states what is *declared* (a fact), offers the other structure as the
alternative, and hands back the one question only the owner can answer — are these folders
layers, or modules — with a path for each answer. It does not say which structure the tree
"looks like": that verdict is `survey`'s classifier, and `survey` sits above `inspect`.
The edit it names is a line the reader can find: `init` writes no `structure` field for
flat, since flat is the default, so the modular direction says *drop* `structure: 'modular'`
rather than sending anyone hunting a `structure: 'flat'` nobody wrote.

**The rule is all-and-all, with a floor at one top-level source folder.** "Every folder
undeclared" is vacuously true at zero, and a fresh Vite template — `src/main.tsx`,
`src/App.tsx`, no folders — satisfies both halves under a *correct* modular config. Without
the floor the tool would tell an adopter their one-minute-old right answer is a mismatch.
`renderCoverage` refuses to call a net vacuous unless `sourceFiles > 0` for the same
reason: a ratio with an empty denominator is no signal wearing one.

Two consequences of having no threshold, accepted rather than papered over. The rule fires
at one folder against one, so the message prints the ratios and never the word "all" — a
reader sees the size of the evidence in the sentence. And one declared folder on disk,
empty or not, silences it, because the absent side is no longer *every*; the per-folder
findings still fire there, so nothing goes unreported.

`doctor`'s architecture check reads the same analysis, so it counts the mismatch with the
rest and goes red on it. `structure-mismatch` is a new finding id, in the migration table
and the enforced-by table beside the others — `inspect` only, because the config's
structure picks the vocabulary every emitted glob is expanded from, so a lint run sits
inside the answer and has no position from which to question it.
