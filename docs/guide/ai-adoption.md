# AI-Assisted Adoption

Adopting blueprint on a **brownfield** repo is a judgment call, not a scaffold: the
layers already exist, and someone has to *read* them before rules can encode them.
Blueprint splits that work into three parts — and only the middle one needs
intelligence:

| Part | Who | Tool |
|---|---|---|
| **Evidence** — folders, import matrix, module shapes, package concentration | deterministic | `blueprint survey` |
| **Judgment** — which folders are layers, which way the flow points, what's debt vs intent | an agent (or you) | the authoring playbook |
| **Validation** — findings must be explainable as real debt, not mistranslation | deterministic | `blueprint inspect` + the baseline ratchet |

## The flow

Run `init` on a repo that has source code but no `blueprint.config.mjs`:

```bash
npx @kekkai/blueprint init
```

Instead of guessing a preset, init surveys the code and writes:

- **`blueprint-authoring.md`** — an executable playbook: the survey evidence, the
  authoring method, the config schema sketch, and the acceptance gates
- **`.claude/commands/blueprint-author.md`** — so Claude Code users can just type
  `/blueprint-author`

Then hand it to your agent:

```bash
claude "Read blueprint-authoring.md at the repository root and execute it end to end."
# or: codex "…same prompt…"
# or, in one step:
npx @kekkai/blueprint init --agent claude
```

The agent derives the config from the evidence, iterates against
`blueprint inspect` until every finding is explainable as real debt, re-runs `init`
for the artifacts, and locks the baseline. You review the result.

`--agent` is the thinnest possible layer: it spawns the **printed** command in the
foreground, interactive, under your own agent CLI's permissions — see
[Security & Trust](/guide/security) for the exact boundaries.

To skip the authoring flow entirely and scaffold the framework preset even on a
brownfield repo, pass `init --preset` — the escape hatch when you already know the
preset fits.

## Why the survey matters

Letting an agent grep a repo from scratch is slow and unreliable. `survey` hands it
deterministic facts instead:

```bash
npx @kekkai/blueprint survey          # human-readable
npx @kekkai/blueprint survey --json   # for tooling / agents
```

- top-level folders with **module-shape evidence** (index coverage, nesting depth —
  the folder-vs-flat call)
- the **folder-to-folder import matrix**, heaviest edges first — the intended flow
  direction, and the counter-edges that are debt
- **package-usage concentration** — `owns` candidates
- test-convention hits — what belongs in `testFiles`, not in `layers`

## Failure semantics

Every artifact is on disk **before** any agent starts. A launch that fails, or an
agent that gives up midway, degrades to exactly the manual path — the same playbook,
walked by you. `inspect` is read-only, `init` is idempotent, and the baseline is only
written at the final step, so there is no half-adopted state to clean up.

## Scope honesty

The playbook authors the config and locks the baseline — it does **not** promise to
refactor the debt away. Existing violations are recorded and paid down later through
the [baseline ratchet](/guide/getting-started#brownfield-—-blueprint-inspect); adoption
and debt burn-down are different jobs.
