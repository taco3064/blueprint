# Blueprint agent operating discipline

> Shipped with `@kekkai/blueprint`. This is the **generic** half of the
> architecture contract — the same for every project. The **project** half
> (modules, layers, flow order, unit shapes, ownership, naming, playbook) is compiled
> from `blueprint.config.mjs` into the repo's generated handbook; the pointer
> block in your agent context file links both.

## The one-way flow

- A layer may import only layers declared **after** it in the blueprint —
  never upstream, never the same layer through the alias.
- Same-layer dependencies use relative paths, never the alias. In a folder-layout
  layer, a sibling unit is reachable only through its declared entry; deeper paths
  stay private. Shared code that does not belong to either unit moves downward.
- Relative imports stay inside the importer's declared **module and layer/position**.
  They never cross a module boundary. A module-root container may reference another
  direct container file only inside its own module, but reaches layer units through
  the alias so the structural rules can see the dependency.
- Folder-layout units are **entry-only**: import the unit path, never internals
  behind its declared entry.

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

- Third-party lint advice sometimes collides with the blueprint's unit
  shape — e.g. a fast-refresh rule asking you to split `XxxContext` and
  `XxxProvider` into separate files, when the unit shape says a context
  unit exports them together. **The blueprint is the source of truth for
  structure**; the other tool's rule is triage, not a verdict. Keep the
  blueprint shape and disable the conflicting rule locally, with a reason.
- The reverse holds too: never use a third-party suggestion as cover to
  bypass a structural rule.

## What no tool enforces (you are the gate)

- Do not create undeclared architectural folders under the project alias root.
  Every such folder belongs to the declared topology: Layer → Unit by default,
  or Module → Layer → Unit when `architecture.modules` is declared. `blueprint inspect`
  catches this after the fact; you prevent it. Its finding directs you to move the
  code into an existing declared layer (and module when that topology applies), or to ask the owner whether
  the architecture itself should change. Only the move is yours to perform.
  If the architecture has genuinely outgrown the config, report it and stop. Editing the
  architecture to fit code you just wrote is how a contract stops describing
  anything.
- Dead code: `npx knip` is the source of truth, not lint. Confirm removal
  candidates before deleting; leave nothing "temporarily kept" without a
  marker the team agreed on.

## Before you commit

- [ ] Imports follow the one-way flow (no upstream layers, same-layer aliases, or escaping relatives).
- [ ] New code sits in the right layer and, when configured, module; folder units expose only their entry.
- [ ] No new undeclared folders under the alias root.
- [ ] Names follow the project's conventions (see the handbook).
- [ ] `npx blueprint inspect` (with `--baseline` on brownfield repos) is green.

## Where the project specifics live

- `blueprint.config.mjs` — the single source of truth.
- The generated handbook (default `docs/architecture-handbook.md`) — modules,
  layers, responsibilities, unit shapes, ownership, naming, principles, playbook.
- `.blueprint-baseline.json` — accepted debt on brownfield repos; the ratchet
  fails only on **new** findings.
