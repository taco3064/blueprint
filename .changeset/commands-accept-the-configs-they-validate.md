---
"@kekkai/blueprint": patch
---

**Three configs the tool accepted and then failed on.**

**`architecture.testFiles: []`** — "tests inherit their layer's rules, nothing is exempt" —
validated, passed `inspect`, and then emitted an ESLint config ESLint refuses to load:
`Key "files": Expected value to be a non-empty array`. `impact` died on the tool's own
output. The `testFilename` entry is scoped to your test globs, so an empty list leaves it
no files: that entry is no longer emitted, and `blueprint rules` says the gate is
unavailable with the reason, rather than dropping it silently.

**A config declaring no optional gates** could not run `impact` at all. It loaded
`@stylistic/eslint-plugin` and `eslint-plugin-import-x` unconditionally — the right trade
when a gate rides one, since a missing carrier makes an active gate report zero hits — and
made it even for a repo translating only structural flow, which needs neither. Each carrier
is now required exactly where a gate uses it, read from the same list `doctor` checks
against.

**A CRLF `tsconfig.json`** — the Windows default — fell through to "add these paths
yourself" instead of getting the alias wired, because the comment-preserving insertion
matched a bare `\n`. Same repo, different platform, no indication anything had been skipped.
The line ending is read off the file now, which also keeps the edit from mixing conventions
into a file your own `@stylistic/linebreak-style` gate would then flag. Two more CRLF
remnants went with it: handbook table cells no longer keep a stray carriage return, and the
`.gitignore` re-include block takes the file's own line ending.
