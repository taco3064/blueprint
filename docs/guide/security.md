# Security & Trust

Part of what this package offers is operating an AI agent on your machine to help with
adoption — so this page spells out exactly what it does, and deliberately does not do.
Every claim below is verifiable in the source.

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

The install is also **the last step, deliberately** — every filesystem effect lands
above it, so what an interrupted run leaves behind is a complete tree minus
`node_modules` rather than a half-wired toolchain. It is the one step that can sit for
minutes (a package manager with no route to the registry retries in silence), so the
line above it carries the command it is about to run, says that quiet is normal, that
minutes of quiet means stopping it and running that line yourself or re-running with
`--no-install`, and what stopping omits: these packages in `package.json`. Until that
line runs, a failure naming one of them is that gap and not a broken adoption.

## Writes are declared and bounded

- **Nothing is written outside the repo it runs in.** `emit.handbook` and
  `emit.agents[].path` are strings from your config that reach the filesystem, and a
  path resolving outside the project root — a leading `../`, an absolute path, a drive
  letter — is refused **before a single write**, naming the path, that nothing was
  written, and the two fields that set one. The realistic input is not an attack but a
  relative path off by one directory in a monorepo, written by the agent blueprint asks
  to author the config; the config is executable JavaScript, so this is a promise that
  such a path fails loudly, not a privilege boundary. Refusing in the planner is also
  what makes `--dry-run` unable to print a plan the real run would reject
- `init --dry-run` prints every effect without touching a file
- `inspect` and `deps` are read-only (`inspect --update-baseline` writes exactly one
  declared file: `.blueprint-baseline.json` — and a zero-finding run writes no file at all)
- Files you own are edited only when they can be rewritten **losslessly**
  (`tsconfig.json` / `jsconfig.json` without comments); anything else — including any
  existing eslint config and any hand-written agent contract file — gets a paste-ready
  snippet, never an overwrite. The reference file that carries the snippet takes its
  suffix *before* the extension (`context.mdc` → `context.blueprint.mdc`), and a
  dotfile keeps its name (`.gitignore` → `.gitignore.blueprint`), so a custom
  `emit.agents[].path` cannot land the generated block on the document it was meant to
  sit beside
- One scoped exception: on a **fresh scaffold** (init generated the blueprint config
  in this very run), init also wires the import alias into the template's
  `vite.config.*` and commented tsconfig, and adds `eslint` to a `lint` script that
  doesn't run it (so lint runs the generated rules) — precondition-guarded text edits
  that only touch the known template shapes, visible in `--dry-run`, falling back to
  instructions on anything unexpected. Existing projects never take this path
- Re-running `init` is idempotent; hand-written content in shared context files
  survives behind marker blocks

## Provenance-signed releases

Every version is published from GitHub Actions with
[npm provenance](https://docs.npmjs.com/generating-provenance-statements) — the build
origin is publicly verifiable on Sigstore.

The release workflow gates on lint, type check, the full test suite at 100% coverage,
the build — **and then on the built artifact itself**, executing `dist/bin.js`,
resolving the `bin` field and importing the package entry. That last layer is there
because the publishing job produces its own `dist/`, and the artifact npm receives is
that one; it is also the only layer that can see a defect living past the bundle
boundary, which every in-process test passes. Details in
[Field-Tested Setups](/guide/field-tested#what-backs-this-page).
