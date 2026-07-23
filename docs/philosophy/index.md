# The Operating Contract

blueprint does more than generate an ESLint config. It puts everyone working on the
project — developers, code reviewers, and the AI agents writing alongside them — under one
set of engineering rules. When they all work to the same contract, the architecture stops
drifting as time passes, people rotate, and agents take turns at the code.

This page is that contract's core — and it is not background reading. `vuePreset()` /
`reactPreset()` carry every page in this section as data; run `init` and these beliefs
become ESLint rules and ground rules for AI agents — guardrails in development, not lip
service. The stance is an **operating contract, not a discussion draft**: on any project
that collaborates with AI agents, install the rules on day one, and the codebase grows
into the shape you chose instead of being refactored back into it after it degrades.

## Blueprint doesn't design your architecture

blueprint will not tell you:

> How should components be layered?
>
> Should a `container` layer exist at all?
>
> Feature folders — yes or no?

Those are your team's calls, and blueprint respects the design you already have. Its one
job:

> **Turn the architecture you've already chosen into engineering rules everyone can follow.**

So whether you adopt a built-in preset or bring an existing repo, blueprint *carries* your
architecture — it never invents one for you. Edit the blueprint's `principles` /
`componentShape` / `playbook`, and you are editing your project's own copy of this contract.

## One contract, many forms

The same contract compiles into different shapes for different readers:

- **ESLint rules** — the machine-checkable part, enforced automatically
- **an architecture handbook** — the "why", for humans
- **an AI agent contract** (`CLAUDE.md`, `AGENTS.md`, …) — the rules an agent works against

They describe one thing from different angles: developers read the handbook, agents obey
the contract, ESLint checks what a tool can check. Every artifact compiles from the same
blueprint, so they can never disagree.

## The three-tier landing

blueprint does not believe that a green lint run means the architecture is sound. Many
architectural calls are semantic — they need someone who understands what the code
*means*:

- Is this component carrying too many responsibilities?
- Is this hook over-abstracted?
- Is this the right direction to refactor?
- Is the module boundary actually clear?

No AST answers those. So every rule in the handbook lands in exactly one of three tiers:

| Tier | Enforced by | Meaning |
|---|---|---|
| ✅ | **lint / config** | Fully checkable — lint blocks violations automatically. Install once. |
| ◐ | **lint (triage) + agent contract** | Lint can only flag an *entry point* (`warn`); the verdict needs review. |
| ○ | **agent contract only** | Semantic, procedural, human judgment — no tool can catch it. The agent holds it every turn. |

That is the mechanism behind blueprint's design: what a machine can check compiles into the
ESLint config; what only a reviewer can judge compiles into the handbook and the agent
contract.

> **A green lint run only means the rules passed.**
>
> **Architecture quality still comes from the contract** — that is belief #6.

## Framework is just syntax

blueprint is not bound to React or Vue. The reactive primitives differ —

- `ref()` ↔ `useState()`
- `computed()` ↔ `useMemo()`

— but the engineering principles line up: layering, component shape, dependency direction,
refactor strategy, collaboration. blueprint cares about those, not the framework beneath
them. The convictions hold across both; only the primitives change.

## How Blueprint carries the contract

Each kind of rule maps to a field in the blueprint, and to the artifact that carries it:

| Handbook part | Blueprint carrier |
|---|---|
| Layer architecture, module shape, ownership | `architecture` → `emitLint` + `inspect` |
| Core beliefs | `principles` → handbook + agent contract |
| Component shape | `componentShape` → handbook + agent contract |
| Runtime / refactor / collaboration | `playbook` → handbook + agent contract |
| Metric gates & custom rules | `rules` → `emitLint` (embedded plugin) |

Editing `blueprint.config` is editing your project's operating contract. Regenerate, and
the ESLint config, the architecture handbook, and the agent contract all move together —
never out of step.

Read on: [Core Beliefs](/philosophy/beliefs) · [Layer Architecture](/philosophy/layers)
· [Component Shape](/philosophy/component-shape) · [Working Discipline](/philosophy/discipline)
