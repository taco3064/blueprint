---
layout: home

hero:
  name: "@kekkai/blueprint"
  text: Architecture as Code
  image:
    src: /logo.png
    alt: blueprint
  tagline: Translates your frontend architecture into ESLint rules, an architecture handbook, and an AI agent contract.
  actions:
    - theme: brand
      text: Get Started
      link: "#quick-start"
    - theme: alt
      text: Philosophy
      link: "#philosophy"
---

## Why you need it

<ProblemCards />

## Write Once. Generate Everything

<CompileFlow />

Edit the config, regenerate, and every artifact moves together — they cannot drift,
because they are all translations of the same source. See them verbatim in
[What init Generates](/guide/generated-artifacts).

## Quick start {#quick-start}

Two ways to adopt on an existing repo. You paste almost nothing — `init --authoring` writes the playbook that tells the agent the rest: run it to the end, and what "done" means.

<QuickStart />

What each acceptance step guards, and the full flow:
[AI-Assisted Adoption](/guide/ai-adoption).

## Philosophy {#philosophy}

Blueprint's engineering philosophy has four facets — all compiling into your repo as lint rules and an agent contract:

<PhilosophyFacets />

It stays deliberately silent on how your framework is used well and what its API actually is — so pair it with the resource for your stack:

- **React & Next.js** — [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills): installable best-practice skills from Vercel Engineering, alongside the blueprint contract, so the agent gets your structure rules _and_ the framework's idioms.
- **Vue** — [vuejs/docs](https://github.com/vuejs/docs): the official documentation source; point your agent at it for **API ground truth**, pairs with the Vue preset.

Blueprint governs _where code goes_; your framework's resource covers _how it's written_ — together they narrow the gap between "it compiles" and "it's good". See the full reasoning in [the philosophy](/philosophy/).
