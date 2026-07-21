# The Operating Contract

This section is not further reading — **it documents the payload that ships inside
blueprint's presets**. `vuePreset()` / `reactPreset()` carry every page here as data:
run `init` and it compiles into your repo as `docs/architecture-handbook.md`, the agent
contract, and — where a machine can check it — the lint gates. Edit the blueprint's
`principles` / `componentShape` / `playbook`, and you are editing your project's copy
of this content.

The convictions hold across Vue and React — the shapes line up; only the reactive
primitives differ (`ref`/`computed` vs `useState`/`useMemo`). And the stance is that of
an **operating contract, not a discussion draft**: on any project that collaborates with
AI agents, install the rules on day one — control the shape early and the codebase grows
into what you designed, instead of being refactored back into shape after it degrades.

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
