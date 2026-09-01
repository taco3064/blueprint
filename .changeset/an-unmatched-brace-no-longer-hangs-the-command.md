---
"@kekkai/blueprint": patch
---

**A glob with an unmatched `{` no longer hangs the command, and a glob that reaches nothing
now says so.** A `{` with no `}` after it used to grow a pattern until Node died with
`FATAL ERROR: Ineffective mark-compacts near heap limit`, naming neither the glob nor the
field it came from. It now compiles as a literal brace and the command finishes.

- **Where it could bite: four inputs, four commands.** A root `.gitignore` line reaches it
  through `init` — including every `init` re-run in a repo that already has a config, which is
  the commonest one you type. `architecture.layerFiles` reaches it through `inspect` and
  `doctor`, `architecture.layerFilesIgnore` through `doctor`, and `architecture.testFiles`
  through `inspect`, `doctor` and `deps`.
- **New: a `testFiles` entry that matches no file is no longer reported as a healthy gate.**
  It was — `✓ error testFilename` and a full optional-gate count, byte-identical to a working
  config, for a rule ESLint then applied to zero files. `blueprint rules` and `inspect` now
  give it the same class of verdict as `testFiles: []`, and name the entry. Measured **per
  declared entry**, so a list like `['**/*.test.*', '**/__tests__/**']` tells you *which* half
  is dead rather than only that something is.
- **New: a `layerFilesIgnore` entry that holds nothing out is reported by `doctor`**, on a line
  under the banner. Previously two configs one character apart printed identical output, banner
  and exit code included.
- **Both new reports are info tier, and no exit code moves.** Nothing that passes today fails.
  There is still no new error, no new warning and no config validation — a malformed glob is
  compiled, not rejected. Neither report guesses at intent: a mistyped glob and a convention
  whose files have not landed yet are indistinguishable from the tree, so both say what is true
  either way and hand the call back to you.
- **No balanced glob moved.** Everything that compiled before compiles to the byte-identical
  pattern. Two brace shapes are still wrong and are deliberately left alone: nested braces
  (`{a,{b,c}}`), and a `{` whose closing `}` belongs to a *later* group
  (`**/{__tests__/**/*.{ts,tsx}`). Both return rather than hang, so neither is the defect this
  fixes.
