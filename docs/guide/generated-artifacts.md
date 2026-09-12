# What `init` Generates

One `blueprint.config.mjs` compiles into four artifacts. This page shows what they
actually look like — taken verbatim from `init` on a fresh Vue project. The rule
everywhere: **edit the blueprint, not the outputs** — every artifact regenerates from
the config, so hand edits are overwritten by design.

## The source: `blueprint.config.mjs`

On a greenfield repo the whole config is one preset call:

<<< @/publication/generated/fresh-vue-js/blueprint.config.mjs{js}

Everything below compiles from it.

## `eslint.config.mjs` — Enforce

The generated flat config is a thin file: the structural rules come from
`emitLint(blueprint)` at lint time, so the config can never drift from the blueprint.
This is also the pattern for merging into an **existing** eslint config — spread
`...emitLint(blueprint)` into your own file, **after** your existing entries
(later entries win in flat config, so this keeps the blueprint's per-layer
tuning alive over broad presets; rules both sides set — `no-restricted-*` —
still merge into ONE entry):

<<< @/publication/generated/fresh-vue-js/eslint.config.mjs{js}

`stylistic` and `imports` are **arguments**, not library dependencies: blueprint has
none, so a gate whose plugin is missing emits nothing while lint stays green. Which
plugin each gate rides, and what `emitLint` expands to — layer flow, ownership, unit
entries, the [embedded plugin rules](/guide/reference#the-embedded-eslint-plugin) — is
enumerated on the reference page.

The sample's `src/**/*` scope comes from the default `architecture.sourceRoot`, not a
fixed path in the generator. A configured root replaces `src` everywhere in this file;
with `sourceRoot: '.'`, the generated scopes start at the project root.

## `docs/architecture-handbook.md` — Explain

The human handbook: the layer diagram (mermaid), a responsibility table, the unit
shape, and the import discipline — all rendered from the same config that drives
lint, so it cannot drift. An excerpt:

<<< @/publication/generated/fresh-vue-js/architecture.md{md}

The diagram and legend above are generated with the complete layer table.
**A drawn edge is not the flow** — that is the one thing to read
carefully, because the intuition runs the other way: reachability is the layer order,
and an edge is only drawn where a layer *narrowed* who may import it.

The full handbook continues with the component-shape axes, the core principles,
and the working playbook — the [Philosophy](/philosophy/) section of this site is the
canonical description of that content.

## `CLAUDE.md` / `AGENTS.md` — Collaborate

The agent contract is deliberately compact: layer flow and hard gates inline, and
pointers to the handbook (placement judgment) and the packaged operating discipline.
It lives between marker comments, so a hand-written `CLAUDE.md` keeps everything
outside the block across regenerations:

<<< @/publication/generated/fresh-vue-js/agent-contract.md{md}

Four things in there are not decoration. **No runner is named** — "the project's lint
run", because a contract generated from your blueprint alone cannot see whether your
repo uses npm or pnpm. **`cycles` is an on-demand or CI diagnosis from
`blueprint inspect`**, not a continuous lint check. `--baseline` grandfathers recorded
cycle findings and fails only on new ones, so a green lint is not read as covering it.
**Each hard gate states how far it
reaches** — only the files the architecture globs match, which is why a freshly scaffolded repo
with empty declared positions has nothing that can fail yet. And **which gates appear depends on the
stack** — the sample above is a JS project, so `explicitAny` is absent from its list, and
a TypeScript project's contract names it; a gate is listed hard only where the tooling
can actually enforce it.

Distribution targets (Cursor, Windsurf, Gemini, Copilot) are configured with
[`emit.agents`](/guide/reference#config-fields-beyond-the-quick-start-example).

To reject cycles on every lint run, opt in through the import plugin that the generated
config already imports. Add this entry after `...emitLint(...)`:

```js
{
  plugins: { 'import-x': imports },
  rules: { 'import-x/no-cycle': 'error' },
}
```

This is deliberately not the default: the rule re-walks the dependency graph per file
and was measured at 92 seconds on an 850-file repository. Use it when continuous
prevention is worth that lint cost; otherwise run `blueprint inspect --baseline` in CI.
