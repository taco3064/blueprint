[![npm](https://img.shields.io/npm/v/@kekkai/blueprint)](https://www.npmjs.com/package/@kekkai/blueprint)
[![codecov](https://codecov.io/gh/taco3064/blueprint/branch/main/graph/badge.svg)](https://codecov.io/gh/taco3064/blueprint)
[![license](https://img.shields.io/npm/l/@kekkai/blueprint)](./LICENSE)

<p align="center">
  <img src="https://taco3064.github.io/blueprint/logo.png" width="160" alt="blueprint logo" />
</p>

# @kekkai/blueprint

> **Architecture as Code** — one Blueprint compiles into ESLint rules, a human
> handbook, and an AI agent contract.

## When an AI writes your code, the architecture is the first thing it quietly erodes

What letting an AI write your code quietly costs — and what blueprint does about each:

| The cost of hands-off AI | blueprint's answer |
| --- | --- |
| **Placement** — new files land wherever's convenient; a few sessions later, nothing lives where it should | Layers become import-boundary rules the agent reads up front and lint blocks — `✗ services/ may not import from pages/` |
| **Single responsibility** — one file quietly grows to do five jobs and own none | Written into the agent contract, backed by the mechanical caps lint can prove |
| **File size** — every edit grows the file; months in, a module hits 6,000 lines and every agent loads all of it to touch one function | `maxLines` caps it before it taxes your token budget — `✗ order.service.ts 6,000 / 300` |
| **Readability** — optimized for *done*, not the next reader — who's another agent that now can't navigate it | Handbook + contract set one bar — naming, shape, ownership — for every session |
| **Consistency** — each session re-derives your architecture from scratch, and guesses differently | `survey` emits deterministic facts; the contract fixes the rules once |
| **Adoption** — point it at a 3-year repo, expect 4,000 errors, team disables it day one | Baseline locks today's debt and gates only what's new — `.blueprint-baseline.json` |

blueprint pins all of this down in **one config** that compiles into everything that keeps
a codebase (and its coding agents) honest:

- **Enforce** — an ESLint flat config, embedded plugin included
- **Explain** — a human handbook (markdown + mermaid)
- **Collaborate** — agent contracts (`CLAUDE.md`, `AGENTS.md`, Cursor, Windsurf…)
- **Verify** — read-only runtimes on the same source (`inspect`, `deps`, `rules`) to wire into any gate you run

One source, so the rules, the docs, and the contract can never disagree. Edit the config,
regenerate, everything moves together. **The packaging is the product.**

## Quick start

Two ways to adopt on an existing repo.

**Hands-off** — paste this to your agent; it runs start to finish on its own:

```text
Run npx @kekkai/blueprint init --authoring to adopt @kekkai/blueprint in this repo,
then execute the blueprint-authoring.md it writes, fully and to the end.
```

**You judge, the agent assists** — blueprint writes the playbook, then launches your
agent to walk it with you:

```bash
npx @kekkai/blueprint init --agent claude
```

Framework auto-detected, existing configs never overwritten, re-runs idempotent. What
each acceptance step guards, greenfield scaffolding, and the full flow:
[AI-Assisted Adoption](https://taco3064.github.io/blueprint/guide/ai-adoption).

## 🔒 Security & trust

- **Never launches an agent by default** — it writes plain-markdown contracts and hands
  off; there is no credential or network surface. `init --agent claude|codex` is the one
  explicit opt-in, running under your own agent CLI's permissions.
- **No network access, zero runtime dependencies** — local file operations only.
- **Writes are declared and bounded** — `--dry-run` prints every effect; `inspect` /
  `deps` are read-only; files are only edited when losslessly rewritable, never overwritten.
- **Provenance-signed releases** — published from GitHub Actions with npm provenance.

Details: [Security & Trust](https://taco3064.github.io/blueprint/guide/security)

## 📖 Documentation

Full guide, API reference, and the engineering philosophy behind it
(**English / 繁體中文**):

**→ https://taco3064.github.io/blueprint/**

## License

[MIT](./LICENSE) © taco3064
