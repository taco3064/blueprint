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
