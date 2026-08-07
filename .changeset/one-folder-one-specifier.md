---
"@kekkai/blueprint": patch
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
rows cannot. Not on the list is an answer too: either the specifier is spread across
folders and the clause does not hold today, or its package sits in one folder and the row
above covers it.

So the playbook stops listing "ownership of a named import" among the clauses that cannot
be derived from the matrix, and points at the evidence instead. One less paragraph of
judgment, one more measured fact.
