# Security & Trust

What this package does — and deliberately does not do — on your machine. Every claim
below is verifiable in the source.

## It never operates an agent

Blueprint **prepares contracts *for* coding agents; it never operates one**. It writes
plain-markdown contracts (`CLAUDE.md`, `AGENTS.md`, Cursor/Windsurf rules) and hands
off — it does **not** launch, shell out to, configure, or authenticate against the
`claude` / `codex` / any agent CLI. There is no credential, token, or authorization
surface, by design: the analysis and setup that `init` and `inspect` perform are
deterministic file operations, not agent invocations.

## No network access

Every command works on local files only. No telemetry, no update checks, no phoning
home — the package contains no network code at all.

## Zero runtime dependencies

`npm install @kekkai/blueprint` installs exactly one package. What you audit is what
runs.

## One child process, declared and skippable

The only external command Blueprint ever runs is the dependency install
(`npm install -D …`) during `init` — it is printed in the plan before it runs, and
`--no-install` skips it entirely. Nothing else is executed.

## Writes are declared and bounded

- `init --dry-run` prints every effect without touching a file
- `inspect` and `deps` are read-only (`inspect --update-baseline` writes exactly one
  declared file: `.blueprint-baseline.json`)
- Files you own are edited only when they can be rewritten **losslessly**
  (`tsconfig.json` / `jsconfig.json` without comments); anything else — including any
  existing eslint config — gets a paste-ready snippet, never an overwrite
- Re-running `init` is idempotent; hand-written content in shared context files
  survives behind marker blocks

## Provenance-signed releases

Every version is published from GitHub Actions with
[npm provenance](https://docs.npmjs.com/generating-provenance-statements) — the build
origin is publicly verifiable on Sigstore, and the release workflow gates on the full
test suite at 100% coverage.
