---
"@kekkai/blueprint": patch
---

**A glob with an unmatched `{` no longer hangs the command, and a dead `testFiles` or
`layerFilesIgnore` entry now says so.** A `{` with no `}` after it used to grow a pattern
until Node died with `FATAL ERROR: Ineffective mark-compacts near heap limit`, naming
neither the glob nor the field it came from. It now compiles as a literal brace and the
command finishes. **`architecture.layerFiles` gains no new per-entry report** — a glob
there that matches nothing still surfaces only as the existing vacuous-enforcement line.

- **Where it could bite: four inputs, four commands.** A root `.gitignore` line reaches it
  through `init` — including every `init` re-run in a repo that already has a config, which is
  the commonest one you type. `architecture.layerFiles` reaches it through `inspect` and
  `doctor`, `architecture.layerFilesIgnore` through `doctor`, and `architecture.testFiles`
  through `inspect`, `doctor` and `deps`. **`blueprint rules` was never exposed** — it did not
  compile a test glob before this release, and it does now only because this release made it a
  reader.
- **New: a declared glob that reaches no file is reported instead of passing silently.**
  `architecture.testFiles` is reported by `inspect`, `rules`, `doctor` and `deps`;
  `architecture.layerFilesIgnore` by `doctor`. Measured **per declared entry**, so a list like
  `['**/*.test.*', '**/__tests__/**']` tells you *which* half is dead rather than only that
  something is.
- **`architecture.testFiles: []` now says why on every surface that reacts to it.** An empty
  list switches the `testFilename` gate off. The optional-gate count drops on `inspect` and
  `doctor` — `deps` has no such count, and what moves there is the blast radius — but only
  `blueprint rules` used to say so. All three now carry the core sentence `rules` already
  printed. **If you declare `testFiles: []` you will see one new line on three commands**,
  and nothing anywhere if every declared glob reaches a file.
- **`blueprint inspect --update-baseline` states the cause before it writes.** Its whole
  output used to be `Baseline updated — N finding(s) recorded in .blueprint-baseline.json.`
  When a broken or empty test net is why a finding exists at all, that finding was being
  **recorded as accepted debt** with nothing in the run to say so. **What it records on disk
  is unchanged** — this is what the run tells you, not what it accepts.
- **A dead `testFiles` net is named, and the gate it emits is reported as emitted.** The gate
  stays `✓ error` with the same optional-gate count as a healthy config — **because the rule
  really is emitted**, beside a `files` holding that glob, and ESLint applies it to whatever it
  matches. What changed is that the run now **names the dead entry** on its own line, so the
  two configs are no longer byte-identical. `testFiles: []` is the one case that closes the
  gate, because it is the one case `emitLint` emits nothing for.
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
- **What moves on `--json`.** `doctor --json`'s existing `note` key is newline-joined and can
  now carry up to three sentences where it previously carried one — the `layerFilesIgnore`
  note, the `testFiles` note, and the pre-existing version-control note. `deps --json` gains a
  conditional top-level `testExemption` key and `inspect --json` gains it inside `coverage`;
  **each of those two has exactly one place, and uses it for every unhealthy `testFiles`,
  `[]` included.** Neither has a `gates` array.
- **`rules --json` is the one command with two places, and the config picks.** Any dead
  declared glob — one of several, or all of them — puts the cause in the **top-level
  `testExemption`**, with the gate still `active: true` because the rule is emitted. **Only
  `testFiles: []`** puts it on the `gates` element whose `id` is `testFilename`, under
  `unavailable`, `active: false` — because that is the one config `emitLint` emits nothing
  for. **A consumer reading one place and not the other will miss that case.**
- **The exemption guarantee states its condition on the guide pages, the CLI's output and
  the emitted documents.** Every surface that said test files are exempt said it flat; the
  guarantee only ever held as far as the declared globs reach. `inspect --help`,
  `deps --help`, `blueprint rules`, `blueprint survey`, `init`'s eslint-wiring note, the
  emitted agent contract and the authoring playbook all now carry the condition, in one
  wording rather than several. **The published pages carry the same sentence** —
  `reference.md`, `deps.md` and `ai-adoption.md`, in both locales.
- **Two emitted documents change.** The full agent contract (`.cursor/rules/blueprint.mdc`,
  `.windsurf/rules/blueprint.md`) and the authoring playbook are edited in place, and no
  single `init` run rewrites both: the scaffold fork writes the contract, the authoring fork
  (a repo with code and no config) writes the playbook. One line is replaced in the contract
  and seven bullets in the playbook, one of which wraps onto a second line; the line count is
  unchanged in every conditional combination, and no neighbouring line moves. The compact
  contract (`CLAUDE.md` / `AGENTS.md`) is **byte-identical**: it carries no exemption claim to
  qualify. **Measured against 3.1.0 rather than against this branch's base, both show more,
  and the contract gains a line** — that added line and the playbook's extra replacements
  belong to the other changesets shipping in the same release.
- **`blueprint rules` moves its unavailability causes out of the header.** The header counted
  them and then carried every cause inside one parenthetical, attributed to *"this stack"* —
  true of a gate the stack cannot open, false of one the config's own globs closed. The count
  stays in the header, and each cause now gets **its own line, prefixed with the gate id**, in
  a block between the count and the listing — **not on the gate's own row**, which still
  carries only its verdict. **No cause string changed**: all three are byte-identical to
  3.1.0, and what moved is the header's predicate and the layout.
- **No balanced glob moved.** Everything that compiled before compiles to the byte-identical
  pattern. Two brace shapes are still wrong and are deliberately left alone: nested braces
  (`{a,{b,c}}`), and a `{` whose closing `}` belongs to a *later* group
  (`**/{__tests__/**/*.{ts,tsx}`). Both return rather than hang, so neither is the defect this
  fixes.
