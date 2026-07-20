[![codecov](https://codecov.io/gh/taco3064/blueprint/branch/main/graph/badge.svg)](https://codecov.io/gh/taco3064/blueprint)

<p align="center">
  <img src="https://taco3064.github.io/blueprint/logo.png" width="160" alt="blueprint logo" />
</p>

# @kekkai/blueprint

> **Architecture as Code** — one Blueprint compiles into ESLint rules, a human
> handbook, an AI agent contract, and a CI gate.

Declare your frontend architecture once — layers, module shape, ownership,
principles — and compile it into everything that keeps a codebase (and its
coding agents) honest:

- **Enforce** — an ESLint flat config, embedded plugin included
- **Explain** — a human handbook (markdown + mermaid)
- **Collaborate** — agent contracts (`CLAUDE.md`, `AGENTS.md`, Cursor, Windsurf…)
- **Gate** — a GitHub Actions workflow: lint + a read-only architecture report

## Quick start

```bash
npx @kekkai/blueprint init      # greenfield: scaffold it all
npx @kekkai/blueprint inspect   # brownfield: architecture report + baseline ratchet
```

**30 seconds on a fresh Vite app** — one command turns this:

```text
my-app/                        my-app/
├─ package.json          ──▶   ├─ blueprint.config.mjs                ← single source of truth
└─ src/                        ├─ eslint.config.mjs                   ← rules + parsers, generated
                               ├─ CLAUDE.md · AGENTS.md               ← agent operating contract
                               ├─ docs/architecture-handbook.md       ← the "why", for humans
                               ├─ .github/workflows/blueprint-ci.yml  ← lint + inspect as the gate
                               └─ src/pages|containers|components|hooks|contexts|services/
```

Framework auto-detected, existing configs never overwritten, re-runs idempotent.

## 🔒 Security & trust

- **Never launches an agent by default** — it writes plain-markdown contracts and
  playbooks for coding agents and hands off; there is no credential or authorization
  surface. `init --agent claude|codex` is the one **explicit opt-in**: it spawns
  exactly the printed command, foreground and interactive, under your own agent CLI's
  permissions — blueprint itself still holds no credentials and makes no network calls.
- **No network access, zero runtime dependencies** — local file operations only.
- **Child processes are declared and skippable** — the dependency install during
  `init` (printed in the plan; `--no-install` skips it), and the opt-in agent launch
  above. Nothing else is executed.
- **Writes are declared and bounded** — `--dry-run` prints every effect; `inspect` /
  `deps` are read-only; your files are only edited when losslessly rewritable, never
  overwritten.
- **Provenance-signed releases** — published from GitHub Actions with npm provenance.

Details: [Security & Trust](https://taco3064.github.io/blueprint/guide/security)

## 📖 Documentation

Full guide, API reference, and the engineering philosophy behind it
(**English / 繁體中文**):

**→ https://taco3064.github.io/blueprint/**

## License

[MIT](./LICENSE) © taco3064
