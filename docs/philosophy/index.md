# The Operating Contract

blueprint does more than generate an ESLint config. It puts everyone working on the
project — developers, code reviewers, and the AI agents writing alongside them — under one
set of engineering rules. When they all work to the same contract, the architecture stops
drifting as time passes, people rotate, and agents take turns at the code.

This page is that contract's core — and it is not background reading. The Vue and React
presets carry this doctrine as config data, while an authored Blueprint can adapt it to
the project. `init` turns the configured architecture and doctrine into executable checks
and generated guidance: guardrails in development, not lip service. The stance is an
**operating contract, not a discussion draft**: install it early so the codebase can grow
within explicit boundaries instead of relying on future cleanup.

## Blueprint doesn't design your architecture

blueprint will not tell you:

> How should components be layered?
>
> Should a `container` layer exist at all?
>
> Feature folders — yes or no?

Those domain and responsibility choices belong to your team. Blueprint does not invent
module names, decide business ownership, or make refactor judgments for you. Its job is
to make the chosen model explicit and enforceable.

> **Turn the architecture you've already chosen into engineering rules everyone can follow.**

That does not make Blueprint architecturally neutral. It supports two explicit topology
models, requires one consistent repository topology, validates module dependency graphs,
reserves router composition semantics, and refuses transformations it cannot perform
safely. Blueprint owns those coherence constraints; the adopter owns the design expressed
inside them.

Whether you begin with a built-in preset or an existing repository, edit the Blueprint's
`architecture`, `principles`, `componentShape`, and `playbook` to maintain the project's
copy of the contract.

## One contract, many forms

The same contract compiles into different shapes for different readers:

- **ESLint rules** — the machine-checkable part, enforced automatically
- **an architecture handbook** — the "why", for humans
- **an AI agent contract** (`CLAUDE.md`, `AGENTS.md`, …) — the rules an agent works against

They describe one governed architecture from different angles: developers read the
handbook, Agents follow the contract, and ESLint checks what a tool can decide. These
generated architecture outputs derive from the valid config and resolved runtime facts
wherever possible, reducing duplicated policy and semantic drift.

That guarantee is deliberately narrower than "every product surface compiles from one
file." CLI decisions, migrations, release information, and this public website have their
own authorities and verification. They are audited against the same product model rather
than pretending they cannot disagree mechanically.

## The three-tier landing

blueprint does not believe that a green lint run means the architecture is sound. Many
architectural calls are semantic — they need someone who understands what the code
*means*:

- Is this component carrying too many responsibilities?
- Is this hook / composable over-abstracted?
- Is this the right direction to refactor?
- Is the module boundary actually clear?

No AST answers those. So every rule in the handbook lands in exactly one of three tiers:

- **✅ lint / config** —<br>
  fully checkable; lint blocks violations automatically. Install once.
- **◐ lint (triage) + agent contract** —<br>
  lint can only flag an *entry point* (`warn`); the verdict needs review.
- **○ agent contract only** —<br>
  semantic, procedural, human judgment — no tool can catch it. The agent holds it every turn.

That is the mechanism behind blueprint's design: what a machine can check compiles into the
ESLint config; what only a reviewer can judge compiles into the handbook and the agent
contract.

> **A green lint run only means the rules passed.**
>
> **Architecture quality still comes from the contract** — that is belief #6.

## Principles cross framework boundaries

Blueprint's architecture principles are not bound to React or Vue. The reactive primitives
differ —

- `ref()` ↔ `useState()`
- `computed()` ↔ `useMemo()`

— but responsibility, component shape, dependency direction, ownership, refactor strategy,
and collaboration can follow the same doctrine.

Framework integration is not identical. Source roots, file-based routing, parser behavior,
and supported transformation boundaries differ across Vue, React, and Next.js. Blueprint
keeps the principles portable while its runtime and presets handle those concrete
boundaries explicitly.

## How Blueprint carries the contract

Each kind of rule maps to a field in the blueprint, and to the artifact that carries it:

- **Layer architecture, unit shape, ownership** — `architecture` → `emitLint` + `inspect`
- **Core beliefs** — `principles` → handbook + agent contract
- **Component shape** — `componentShape` → handbook + agent contract
- **Runtime / refactor / collaboration** — `playbook` → handbook + agent contract
- **Metric gates & custom rules** — `rules` → `emitLint` (embedded plugin)

Editing `blueprint.config.mjs` is editing the project authority behind these generated
architecture outputs. Refreshing them from that authority keeps their shared facts aligned
and gives `inspect` and `doctor` something concrete to verify.

Read on: [Core Beliefs](/philosophy/beliefs) · [Layer Architecture](/philosophy/layers)
· [Component Shape](/philosophy/component-shape) · [Working Discipline](/philosophy/discipline)
