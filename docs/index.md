---
layout: home

hero:
  name: '@kekkai/blueprint'
  text: Architecture as Code
  tagline: One Blueprint compiles into ESLint rules, a human handbook, an AI agent contract, and a CI gate.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Philosophy
      link: /philosophy/
    - theme: alt
      text: API Reference
      link: /api/

features:
  - icon: 🧱
    title: Enforce
    details: emitLint compiles the layer flow, module boundaries, and ownership rules into an ESLint flat config — with an embedded plugin, nothing extra to install.
  - icon: 📖
    title: Explain
    details: emitHandbook renders a human handbook (markdown + mermaid) that cannot drift from the rules, because both compile from the same source.
  - icon: 🤖
    title: Collaborate
    details: emitAgentFiles distributes one agent operating contract across CLAUDE.md, AGENTS.md, Cursor, Windsurf, and more.
  - icon: 🚦
    title: Gate
    details: emitCi renders a GitHub Actions workflow — lint plus a read-only architecture report, exit 1 on violations.
---

## Works better together

Blueprint owns the **architecture** layer of an agent's context — where code goes, what
imports what, which judgments the agent must hold. Two companions cover the layers it
deliberately leaves to others:

| Companion | What it adds |
|---|---|
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | Curated, installable **skills** for coding agents — framework and tooling best practices that sit alongside the blueprint contract, so the agent gets your structure rules *and* the ecosystem's idioms. |
| [vuejs/docs](https://github.com/vuejs/docs) | The official Vue documentation source. Point your agent at it (clone it locally, or wire it in as a reference source) for **API ground truth** — pairs especially well with the Vue preset. |

One contract for *where code goes* (blueprint), one skill pack for *how the framework is
used well* (agent-skills), one authoritative reference for *what the API actually is*
(official docs) — three inputs that barely overlap, and together they close most of the
gap between "it compiles" and "it's good".
