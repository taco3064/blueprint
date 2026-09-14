---
layout: home

hero:
  name: "@kekkai/blueprint"
  text: Architecture as Code
  image:
    src: /logo.png
    alt: blueprint
  tagline: One architecture definition for executable checks, human guidance, and coding Agents.
  actions:
    - theme: brand
      text: Adopt with AI
      link: "#adopt-with-ai"
    - theme: alt
      text: Define the architecture
      link: "/configuration"
---

## Keep architecture executable

Architecture rules usually live in diagrams, review comments, and memory. They drift because the
code, the documentation, and the instructions given to coding Agents evolve separately.

Blueprint puts the durable architecture model in `blueprint.config.mjs`. From that definition it
can produce structural ESLint checks, a human-readable handbook, and guidance for the coding Agents
that work in the project. `inspect`, `doctor`, `deps`, and the other commands then measure the real
repository against that model.

## Adopt with AI

Choose the architecture contract you want this repository to follow. Blueprint will not infer this
decision from the current folder shape.

<AdoptWithAI />

Want to understand the decision or run the CLI manually? See [`init` in Commands](/commands#init).

## Go deeper

- [Commands](/commands) — every public command, flag, output, and refusal boundary.
- [Configuration](/configuration) — the complete `blueprint.config.mjs` model.
- [Generated Files](/generated-files) — what `init` creates or changes, who owns it, and for how long.
- [Philosophy](/philosophy/) — the engineering principles behind the contract.
- [API reference](/api/) — generated package signatures for library consumers.

Security reports and supported-version policy live in the repository
[Security policy](https://github.com/taco3064/blueprint/security/policy). Release history lives in
the repository [Changelog](https://github.com/taco3064/blueprint/blob/main/CHANGELOG.md).
