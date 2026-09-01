---
"@kekkai/blueprint": patch
---

**A glob with an unmatched `{` no longer hangs the command.** A `{` with no `}` after it
now compiles as a literal brace, so the command finishes instead of growing a pattern
until Node dies with `FATAL ERROR: Ineffective mark-compacts near heap limit`. There was
no blueprint error before this — nothing named the glob, the config field, or the
`.gitignore` line it came from, and the wait scaled with the heap ceiling, so at a default
Node old space it was minutes rather than seconds.

- **Four inputs could trigger it, across four commands.** A root `.gitignore` line
  (`init`, on the preset scaffold — git's ignore syntax has no brace expansion, so a `{`
  there is an ordinary path character); `architecture.layerFiles` (`inspect`, `doctor`);
  `architecture.layerFilesIgnore` (`doctor`); and `architecture.testFiles` (`inspect`,
  `doctor`, `deps`). None of the three config fields is validated for glob syntax, and
  that has not changed.
- **Nothing is asked of you, and no output is new.** A glob with an unmatched brace now
  matches paths spelled with a literal brace — which usually means it matches nothing, and
  a net that matches nothing is already what `inspect`'s "Enforcement is vacuous" line and
  the coverage report's outside-the-nets list exist to show you. No new error, no new
  warning, no new config validation.
- **No balanced glob moved.** Every glob that compiled before compiles to the byte-identical
  pattern, including two brace groups in one glob (`{a}{b}`) and nested braces
  (`{a,{b,c}}`). Nested braces still compile to something wrong — that is a separate
  defect, unchanged here and pinned so this fix could not drift into it.
