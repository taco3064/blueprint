# Blueprint agent operating discipline

> Shipped with `@kekkai/blueprint`. This is the **generic** half of the
> architecture contract — the same for every project. The **project** half
> (layers, flow order, module shapes, ownership, naming, playbook) is compiled
> from `blueprint.config.mjs` into the repo's generated handbook; the pointer
> block in your agent context file links both.

## The one-way flow

- A layer may import only layers declared **after** it in the blueprint —
  never upstream, never the same layer through the alias.
- Same-layer code sharing means the shared part wants to live in a **lower**
  layer — extract it downward; do not import a sibling through the alias.
- Relative imports stay **inside their module**. Crossing a module (or layer)
  boundary relatively hides the dependency from review — use the alias, which
  the structural rules can see.
- Folder-layout modules are **entry-only**: import `layer/module`, never
  `layer/module/internals`.

## When lint fails

- Fix the **structure** — move the code, or extract a lower layer. The error
  is the architecture speaking, not a formality.
- Never silence a structural rule with `eslint-disable`; never "fix" a
  violation by relocating it to a sibling file the rule does not cover yet.
- Every intentional disable of a *non-structural* rule carries a reason
  (`-- why`), or lint rejects it.
- Treat `warn`-tier results as review entry points: look, then decide —
  don't ignore, don't blindly appease.

## When another tool disagrees

- Third-party lint advice sometimes collides with the blueprint's module
  shape — e.g. a fast-refresh rule asking you to split `XxxContext` and
  `XxxProvider` into separate files, when the module shape says a context
  module exports them together. **The blueprint is the source of truth for
  structure**; the other tool's rule is triage, not a verdict. Keep the
  blueprint shape and disable the conflicting rule locally, with a reason.
- The reverse holds too: never use a third-party suggestion as cover to
  bypass a structural rule.

## What no tool enforces (you are the gate)

- Do not create undeclared folders under the project alias root. Every folder
  is a declared layer or a module inside one — `blueprint inspect` catches
  this after the fact; you prevent it.
- Dead code: `npx knip` is the source of truth, not lint. Confirm removal
  candidates before deleting; leave nothing "temporarily kept" without a
  marker the team agreed on.

## Before you commit

- [ ] Imports follow the one-way flow (no upstream / same-layer / escaping relatives).
- [ ] New code sits in the right layer; folder modules expose only their entry.
- [ ] No new undeclared folders under the alias root.
- [ ] Names follow the project's conventions (see the handbook).
- [ ] `npx blueprint inspect` (with `--baseline` on brownfield repos) is green.

## Where the project specifics live

- `blueprint.config.mjs` — the single source of truth.
- The generated handbook (default `docs/architecture-handbook.md`) — layers,
  responsibilities, module shapes, ownership, naming, principles, playbook.
- `.blueprint-baseline.json` — accepted debt on brownfield repos; the ratchet
  fails only on **new** findings.
