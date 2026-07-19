# The Operating Contract

Blueprint is the tooling half of an engineering governance handbook — a set of design
convictions about components and architecture that hold across Vue and React. The shapes
line up; only the reactive primitives differ (`ref`/`computed` vs `useState`/`useMemo`).

The handbook's stance: it is an **operating contract, not a discussion draft**. On any
project that collaborates with AI agents, install the rules on day one — control the
shape early and the codebase grows into what you designed, instead of being refactored
back into shape after it degrades.

## The three-tier landing

Every rule in the handbook lands in exactly one of three places:

| Tier | Landing | Meaning |
|---|---|---|
| ✅ | **lint / config** | A rule backs it — CI blocks violations automatically. Install once. |
| ◐ | **lint (triage) + agent contract** | Lint can only flag an *entry point* (`warn`); the verdict needs review. |
| ○ | **agent contract only** | No tool can catch it — semantic, procedural, human judgment. The agent holds it every turn. |

This is the mechanism behind Blueprint's design: what a machine can check compiles into
the ESLint config; what only a reviewer can judge compiles into the handbook and the agent
contract. **A green lint run never means the architecture is correct** — that is belief #7.

## Where Blueprint fits

| Handbook part | Blueprint carrier |
|---|---|
| Layer architecture, module shape, ownership | `architecture` → `emitLint` + `inspect` |
| Ten core beliefs | `principles` → handbook + agent contract |
| Component shape (7 axes) | `componentShape` → handbook + agent contract |
| Data integrity / runtime / refactor / collaboration | `playbook` → handbook + agent contract |
| Metric gates & custom rules | `rules` → `emitLint` (embedded plugin) |
| CI | `emit.ci` → `emitCi` |

Read on: [Ten Core Beliefs](/philosophy/beliefs) · [Layer Architecture](/philosophy/layers)
· [Component Shape](/philosophy/component-shape) · [Working Discipline](/philosophy/discipline)
