---
layout: home

hero:
  name: '@kekkai/blueprint'
  text: Architecture as Code
  image:
    src: /logo.png
    alt: blueprint
  tagline: Translates your frontend design philosophy into ESLint rules, a human-readable handbook, ground rules for AI agents, and a CI gate.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Feature Overview
      link: /guide/features
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
    link: /guide/generated-artifacts#eslint-config-mjs-—-enforce
    linkText: See the generated config
  - icon: 📖
    title: Explain
    details: emitHandbook renders a human handbook (markdown + mermaid) that cannot drift from the rules, because both compile from the same source.
    link: /guide/generated-artifacts#docs-architecture-handbook-md-—-explain
    linkText: See the handbook
  - icon: 🤖
    title: Collaborate
    details: emitAgentFiles distributes one agent operating contract across CLAUDE.md, AGENTS.md, Cursor, Windsurf, and more.
    link: /guide/generated-artifacts#claude-md-agents-md-—-collaborate
    linkText: See the contract
  - icon: 🚦
    title: Gate
    details: emitCi renders a GitHub Actions workflow — lint plus a read-only architecture report, exit 1 on violations.
    link: /guide/generated-artifacts#github-workflows-blueprint-ci-yml-—-gate
    linkText: See the workflow
  - icon: 🧭
    title: Adopt
    details: The brownfield flow — survey collects the evidence, your own agent authors the config, and the baseline ratchet locks today's debt so it only tightens.
    link: /guide/ai-adoption
    linkText: See the adoption flow
  - icon: 🔎
    title: Verify
    details: Read-only runtimes on the same source — inspect judges the architecture (nine finding kinds, CI-gateable), deps answers "who gets hit if I change this".
    link: /guide/features#checks-—-what-gets-caught
    linkText: See what gets caught
---

## One source, everything compiled

<div class="compile-flow">
  <div class="cf-source">blueprint.config.mjs</div>
  <div class="cf-arrow">→</div>
  <div class="cf-outputs">
    <div>eslint.config.mjs <span>Enforce — structural rules + embedded plugin</span></div>
    <div>docs/architecture-handbook.md <span>Explain — the handbook humans read</span></div>
    <div>CLAUDE.md · AGENTS.md · … <span>Collaborate — ground rules for AI agents</span></div>
    <div>.github/workflows/blueprint-ci.yml <span>Gate — lint + inspect in CI</span></div>
    <div>inspect · deps · rules <span>Verify — read-only runtimes on the same source</span></div>
  </div>
</div>

Edit the config, regenerate, and every artifact moves together — they cannot drift,
because they are all translations of the same source. See them verbatim in
[What init Generates](/guide/generated-artifacts).

## Why

AI agents write code fast — but where a file goes, and who may import whom, rides on
whatever the agent happens to hold in context. Meanwhile the architecture doc, the
ESLint config, and CLAUDE.md are three hand-maintained documents that inevitably stop
telling the same story.

blueprint collapses them into one config: what the rules say is what lint blocks, what
the handbook explains, and what the agent holds.

## Hand it to your agent

Brownfield repo, fully automated? Paste this to your agent:

```text
Help adopt @kekkai/blueprint in this repo, autonomously:
run `npx @kekkai/blueprint init --authoring`,
then execute the blueprint-authoring.md it writes, fully and to the end
(an early exit the playbook itself prescribes counts as full execution).

Acceptance (`blueprint doctor` passes):
- lint, `inspect --baseline`, and the existing tests all pass
  (no tests = passes vacuously)
- emitLint genuinely wired into ESLint (no leftover reference files)
- no source edits — lock existing debt: `inspect --update-baseline` for
  architecture, `eslint --suppress-all` for lint (both only when debt
  exists — an empty ledger is ceremony, not a deliverable)
```

What each acceptance clause guards, and the full flow:
[AI-Assisted Adoption](/guide/ai-adoption).

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
