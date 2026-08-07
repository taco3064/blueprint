---
"@kekkai/blueprint": minor
---

**More of what you need to author a config is now something the tool computed, not
something you have to go and check.**

**`blueprint survey` names the specifiers an `owns` clause can be verified with.** `owns`
takes `{ package: 'react', imports: ['createContext'] }`, and the survey's evidence was
package-granular — `react` reads as "half the layers use it" whichever specifier the clause
names, so there was nothing to check such a clause against. There is now a section for
specifiers that appear in **exactly one folder, from a package that appears in several**:

```
Named imports in ONE folder, from a package in several (specifier-level ownership
candidates — `owns: [{ package, imports: […] }]`; the rows above cannot support one).
Read from brace clauses only: a member reached through `import * as` is invisible
here, so a folder using one is not counted against the "only":
  react → createContext — contexts only
  react → useContext — hooks only
```

**`blueprint rules --json` carries `jsLiteral` beside `selectors`.** The selectors you are
told to copy when folding blueprint's `no-restricted-syntax` entry into a house one escape
their path separators — and JavaScript resolves that same escape when it parses a string
literal, so pasting the rendered value into `'…'` produced a regex that ends early. No parse
error, lint still green, and the ban silently matching nothing. `jsLiteral` is the selector
as JS source, quotes included; the text output prints that form, since that line exists to
be copied. `selectors` is unchanged for programs that build config rather than paste it.

**One `inspect` run inventories every import cycle**, not just the first one it meets — one
per strongly connected component, ordered by content so an unrelated module does not
reshuffle the report. Enforcement never changed (one cycle fails the gate), but "how many"
is the question anyone sizing a migration is asking.

**`inspect`'s coverage line names the files outside your layer nets**, so a number you
could not check became a list you can.

**Every output that reports the import graph says how the graph was read** — source text,
not a parsed AST — so a green does not read as a stronger guarantee than it is.
