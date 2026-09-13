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
      text: Start with init
      link: "/commands#init"
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

## Choose the topology that matches the project

- **Layer-first** uses `Layer → Unit`: application-wide layers such as `pages`, `components`, and
  `services` own the source tree.
- **Module-first** uses `Module → Layer → Unit`: ordinary domain modules repeat one shared inner
  layer contract, while module `dependsOn` edges form an outer dependency boundary.

Blueprint does not infer topology from folder names. A valid config is the authority, and guarded
transformation flows handle deliberate changes between the two models.

## First adoption

Preview a layer-first adoption without writing:

```bash
npx @kekkai/blueprint init --topology layer-first --dry-run
```

Start module-first authoring:

```bash
npx @kekkai/blueprint init --topology module-first
```

Existing code is surveyed before Blueprint asks a coding Agent to author or transform the
architecture. Small new projects may instead use the Vue, React, or Next preset path.

## Go deeper

- [Commands](/commands) — every public command, flag, output, and refusal boundary.
- [Configuration](/configuration) — the complete `blueprint.config.mjs` model.
- [Generated Files](/generated-files) — what `init` creates or changes, who owns it, and for how long.
- [Philosophy](/philosophy/) — the engineering principles behind the contract.
- [API reference](/api/) — generated package signatures for library consumers.

Security reports and supported-version policy live in the repository
[Security policy](https://github.com/taco3064/blueprint/security/policy). Release history lives in
the repository [Changelog](https://github.com/taco3064/blueprint/blob/main/CHANGELOG.md).
