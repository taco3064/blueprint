---
"@kekkai/blueprint": minor
---

**The three emitted documents stop calling `explicitAny` hard on a project without
TypeScript.** `any` is a TypeScript construct with no core rule to fall back to, so the
gate cannot be opened on a JS stack. The two runtimes reached that verdict first, and not in
the same release: `blueprint inspect` has left the gate out of the `optional gates active`
count it prints since 3.0.0 — the number moved and nothing said why — and
`blueprint rules` has marked the row `· declared, unavailable here` and printed the reason
beside it since 3.1.0. None of it reached the three documents, because a document is
generated from your blueprint and a blueprint does not contain your dependency list.

**The fact now travels, and it is the one you already have.** `emitHandbook` takes an
options argument for the first time, and `emitAgentFiles` takes a third one; both accept
`StackFacts` — `{ hasTypescript?: boolean }` — the same way `emitLint` already takes its
plugin carriers. `StackFacts` is exported from the package entry, and it is the one name
this change adds to `dist/index.d.ts`, with nothing there removed or renamed; that addition
is what the minor bump is for. `init` passes what `detect` read off your `package.json`, so
nothing is asked of you — the fact is optional, and every existing call keeps its current
behaviour.

**Regenerating on a JS project changes one line per document, and nothing else.**

- **The full contract drops the bullet.** `` - `explicitAny` is a hard gate. `` is gone
  from `.cursor/rules/blueprint.mdc` and `.windsurf/rules/blueprint.md`.
- **The compact contract drops the name** from the hard-gates clause in `CLAUDE.md` /
  `AGENTS.md`. The rest of the sentence, including every gate that really is held, is
  untouched.
- **The handbook keeps the row and names no machine.** The declaration is yours, so it
  stays on the table; the Enforced-by cell reads `` `nothing — <reason>` `` with the same
  reason `blueprint rules` prints, which is the form that column already used for
  `deepWatch` on React and for `testFilename` under `architecture.testFiles: []`.

**On a project that has TypeScript, this change moves nothing.** Measured across thirteen
blueprints rendered to all six agent targets plus the handbook, ninety-one files per stack,
against the tree this was written on — 3.1.0 plus the other entries shipping in this
release: zero differ, and zero differ between an explicit `hasTypescript: true` and calling
the emitters exactly as before. On the same set with `hasTypescript: false`, twenty-one
files change — the three blueprints that declare `explicitAny`, one line in each of their
seven documents. **Measured against 3.1.0 itself, twenty-four of the ninety-one differ on a
TypeScript stack as well** — the full contract on `.cursor/rules/blueprint.mdc` and
`.windsurf/rules/blueprint.md`, in twelve of the thirteen blueprints — and each of those
files is byte-identical to what the tree without this change already renders, so every line
in them belongs to the other changesets in this release, not to this one.

**What this does not fix.** `codeStyle`, `statementsPerLine`, `statementPadding` and
`importBlock` are still named hard on a project that spreads `emitLint` without injecting
`@stylistic` or `eslint-plugin-import-x`. Those are facts about your ESLint wiring rather
than your dependency list, and `blueprint doctor` is the surface that reads a real config
and reports them. `explicitAny` moved because it is the one this tool can answer at emit
time.

**One position on `explicitAny`, across both entries in this release.** The patch entry
"The full agent contract stops calling a gate hard where nothing keeps that promise" ends
on its own *What this does not fix*, which names `explicitAny` among the gates it leaves
alone and puts the whole group down to your dependency list; it was written against the
tree before this change. **This entry is what changes its `explicitAny` line.** The split
above is the one that holds — only `explicitAny` turns on your dependency list, and the
other three it names turn on your ESLint wiring. What still stands there is a TypeScript
project whose config omits the `typescript` carrier: the gate is available on that stack,
so the contract still names it hard, and `blueprint doctor` is still where that shows up.
