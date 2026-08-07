---
"@kekkai/blueprint": minor
---

**The survey names the specifiers an `owns` clause can be verified with.** `owns` takes
`{ package: 'react', imports: ['createContext'] }`, so a config can hand one named import
to one layer — and the survey's evidence was package-granular, so the re-adoption step's
instruction to "verify against what the matrix CAN see" could not be followed for that
clause at all: `react` reads as "half the layers use it" whichever specifier the clause
names. An adopting agent invented `grep` for it and said so, which is the honest report of
a gap the tool had no stance on.

It had the data. `scan` records every named import already, and the survey was dropping
them. There is now a section for specifiers that appear in **exactly one folder, from a
package that appears in several** — the only rows that can support a clause the package
rows cannot.

The playbook keeps listing it among the clauses a matrix cannot *derive* — because it
cannot — and now says what CONFIRMS one, plus the thing that matters more on a
re-adoption: absence from that list is never a licence to drop the clause. A specifier
nobody imports yet is a forward-looking ban, one whose package sits in a single folder is
already covered by the package row, and one several folders import is existing debt for
the baseline. All three keep the clause; only the first reading of "not on the list" would
have handed back a config looser than the one it replaced.

Minor, not patch: `SurveyResult` is exported and `ownableImports` is a required field on
it, so code that constructs the type — rather than only reading `runSurvey`'s return —
stops compiling until it adds one.
