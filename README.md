[![codecov](https://codecov.io/gh/taco3064/blueprint/branch/main/graph/badge.svg)](https://codecov.io/gh/taco3064/blueprint)

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

## 📖 Documentation

Full guide, API reference, and the engineering philosophy behind it
(**English / 繁體中文**):

**→ https://taco3064.github.io/blueprint/**

## License

[MIT](./LICENSE) © taco3064
