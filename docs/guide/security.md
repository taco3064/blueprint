# Security & Trust

What this package does — and deliberately does not do — on your machine. Every claim
below is verifiable in the source.

## It never launches an agent — except when you explicitly ask

Blueprint **prepares contracts and playbooks *for* coding agents; by default it never
operates one**. It writes plain-markdown contracts (`CLAUDE.md`, `AGENTS.md`,
Cursor/Windsurf rules) and — on brownfield repos — an authoring playbook, then hands
off. It does **not** configure or authenticate against the `claude` / `codex` / any
agent CLI. There is no credential, token, or authorization surface: the analysis that
`init`, `survey`, and `inspect` perform is deterministic file operations, not agent
invocations.

The one exception is explicit: `init --agent claude|codex` spawns the user's own
agent CLI on the authoring playbook. The boundaries of that opt-in:

- **The exact command is printed before it runs** — the same one-liner you could
  paste yourself; `--agent` adds nothing beyond executing it.
- **Foreground and interactive** — the session runs under your agent CLI's own
  permission prompts. Blueprint grants nothing, passes no tokens, and reads nothing
  back from the session.
- **Every artifact lands on disk before the spawn** — a failed launch (or an
  abandoned session) degrades to exactly the manual path, which is the same path.
- **`--dry-run` never launches.**

## No network access

Every command works on local files only. No telemetry, no update checks, no phoning
home — the package contains no network code at all.

## Zero runtime dependencies

`npm install @kekkai/blueprint` installs exactly one package. What you audit is what
runs.

## Child processes are declared and skippable

Blueprint runs exactly two kinds of external command, both declared before they run:
the dependency install (`npm install -D …`) during `init` — printed in the plan,
skipped by `--no-install` — and the opt-in agent launch described above. Nothing else
is executed.

## Writes are declared and bounded

- `init --dry-run` prints every effect without touching a file
- `inspect` and `deps` are read-only (`inspect --update-baseline` writes exactly one
  declared file: `.blueprint-baseline.json`)
- Files you own are edited only when they can be rewritten **losslessly**
  (`tsconfig.json` / `jsconfig.json` without comments); anything else — including any
  existing eslint config — gets a paste-ready snippet, never an overwrite
- One scoped exception: on a **fresh scaffold** (init generated the blueprint config
  in this very run), init also wires the import alias into the template's
  `vite.config.*` and commented tsconfig — precondition-guarded text edits that only
  touch the known template shapes, visible in `--dry-run`, falling back to
  instructions on anything unexpected. Existing projects never take this path
- Re-running `init` is idempotent; hand-written content in shared context files
  survives behind marker blocks

## Provenance-signed releases

Every version is published from GitHub Actions with
[npm provenance](https://docs.npmjs.com/generating-provenance-statements) — the build
origin is publicly verifiable on Sigstore, and the release workflow gates on the full
test suite at 100% coverage.
