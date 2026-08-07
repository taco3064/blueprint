---
"@kekkai/blueprint": patch
---

**`architecture.testFiles: []` no longer emits a config ESLint refuses to load.** It is a
real intent — "tests inherit their layer's rules, nothing is exempt" — and it validated,
`inspect` ran clean on it, and then the emitted `testFilename` entry came out as
`files: []`, which ESLint rejects outright: `Key "files": Expected value to be a non-empty
array at user-defined index 14`. `impact` died on the tool's own output. The adopter spent
eight minutes on it, read `dist/config/types.d.ts` to check the field was even real — the
one thing the playbook says never to need — and left with a sentinel glob invented to
stand in for the empty array.

An entry scoped to no file protects nothing, so it is not emitted. And the gate says why,
rather than going quiet: `blueprint rules` lists `testFilename` as **unavailable here**
with the reason, on the same footing as `explicitAny` on a JS repo, and `inspect`'s
optional-gate denominator drops it to match. A gate declared `error` and silently absent
from the config is the half-truth that column exists for.

Swept, not patched: `files: testGlobs` was the only entry whose scope can be empty — every
other one is built from `layers`, which validation already refuses to leave empty. The case
is fossilized in the conformance suite, where a real ESLint loads the emitted config,
because that is the only layer that can see this class of defect: every unit test passed.

**The survey stops calling a folder with no source files empty.** Each row said `N files`,
and the row exists *because* the directory does — so `0` read as an empty folder, which is
the one thing it cannot mean. An adopter took `styles 0 files` for empty, ran `ls`, and
found a directory of `.css`. The count now says `source files`, and the zero case says
outright that the folder is present and holds none — whatever is in it, this survey does
not read it.

**And the install note stops claiming a test it does not run.** "eslint unpinned, resolving
to the newest supported major (9 and 10 are both tested)" — this package's own
devDependency is eslint 9, so every suite and every CI leg runs 9 and nothing runs 10. A
field agent verified the adjacent half, `^10.8.0` landing in `package.json`, which makes
the overclaim worse: 10 is the version an adopter actually gets. What is verified, per
carrier and read off the installed manifests, is that every peer range admits every major
on the list — the fact that decides whether their install resolves at all, and the question
this note is answering. It says that now.
