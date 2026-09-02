---
"@kekkai/blueprint": patch
---

**A glob with an unmatched `{` no longer hangs the command, and a glob that reaches nothing
now says so.** A `{` with no `}` after it used to grow a pattern until Node died with
`FATAL ERROR: Ineffective mark-compacts near heap limit`, naming neither the glob nor the
field it came from. It now compiles as a literal brace and the command finishes.

- **Where it could bite: four inputs, five commands.** A root `.gitignore` line reaches it
  through `init` — including every `init` re-run in a repo that already has a config, which is
  the commonest one you type. `architecture.layerFiles` reaches it through `inspect` and
  `doctor`, `architecture.layerFilesIgnore` through `doctor`, and `architecture.testFiles`
  through `inspect`, `doctor`, `deps` and `rules`.
- **New: a declared glob that reaches no file is reported instead of passing silently.**
  `architecture.testFiles` is reported by `inspect`, `rules`, `doctor` and `deps`;
  `architecture.layerFilesIgnore` by `doctor`. Measured **per declared entry**, so a list like
  `['**/*.test.*', '**/__tests__/**']` tells you *which* half is dead rather than only that
  something is.
- **A dead `testFiles` net no longer reads as a healthy gate.** When **every** declared entry
  reaches nothing, `testFilename` was reported `✓ error` with a full optional-gate count —
  byte-identical to a working config, for a rule ESLint then applied to zero files. It now gets
  the same class of verdict as `testFiles: []`. With a live entry beside a dead one the gate
  stays open and only the dead entry is named.
- **`blueprint deps` explains a blast radius it could not explain before.** A dead `testFiles`
  entry stops the exemption applying, so a test file's import counts toward a module's fan-in.
  **That number has not changed** — it is what "matching the lint side" already meant, because
  the emitted ESLint config carries the same dead glob. What is new is that the run says why,
  on both the text and `--json` channels.
- **What the report says depends on what the tool can actually determine.** Where the scan's
  own reach settles it — the entry points outside `sourceRoot`, at a file type the walk does not
  read, or into a directory it never descends into — the output **states** which. Where it does
  not, a mistyped glob and a convention whose files have not landed are indistinguishable from
  the tree, so it **hands the call back to you**. And for an entry beginning `!`, which this
  tool reads as an ordinary path character and ESLint reads as a negation, it says it **cannot
  speak for the entry** rather than guessing either way.
- **Everything new is info tier, and no exit code moves.** Nothing that passes today fails.
  There is still no new error, no new warning and no config validation — a malformed glob is
  compiled, not rejected.
- **What moves on `--json`.** `doctor --json`'s existing `note` key can now carry two
  sentences, newline-joined, where it previously carried one. `deps --json` and `rules --json`
  gain a conditional top-level `testExemption` key. On `rules`, that key appears when *some*
  declared entries are dead; when **every** entry is dead the cause rides the existing
  `gates.testFilename.unavailable` instead, so a consumer reading one and not the other will
  miss a case.
- **No balanced glob moved.** Everything that compiled before compiles to the byte-identical
  pattern. Two brace shapes are still wrong and are deliberately left alone: nested braces
  (`{a,{b,c}}`), and a `{` whose closing `}` belongs to a *later* group
  (`**/{__tests__/**/*.{ts,tsx}`). Both return rather than hang, so neither is the defect this
  fixes.
