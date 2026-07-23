---
layout: home

hero:
  name: '@kekkai/blueprint'
  text: Architecture as Code
  image:
    src: /logo.png
    alt: blueprint
  tagline: Translates your frontend architecture into ESLint rules, an architecture handbook, and an AI agent contract — so humans and AI follow the same architecture.
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
---

## Why you need it

<ProblemCards />

## Write Once. Generate Everything

<CompileFlow />

Edit the config, regenerate, and every artifact moves together — they cannot drift,
because they are all translations of the same source. See them verbatim in
[What init Generates](/guide/generated-artifacts).

## Quick start

Two ways to adopt on an existing repo. You paste almost nothing — `init --authoring` writes the playbook that tells the agent the rest: run it to the end, and what "done" means.

<QuickStart />

What each acceptance step guards, and the full flow:
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
