# Blast Radius — `blueprint deps`

`blueprint deps` answers one question before you touch a unit: **who gets hit if I
change this?** It is read-only, needs no setup beyond the blueprint itself, and never
writes a file.

It is the day-to-day companion to [`blueprint inspect`](/guide/getting-started#brownfield-—-blueprint-inspect):
`inspect` **judges** the architecture (violations, cycles, exit 1), `deps` only
**describes** it — fan-in and fan-out per unit, no verdict attached.

Both read the same graph, and that graph is built from **source text, not a parsed
AST** — see [how the import graph is read](/guide/reference#how-the-import-graph-is-read).
A computed `import(path)` does not appear in a fan-in count, so treat a blast radius as
a floor rather than an exact number. Every `deps` output closes on that note.

## How to run it

```bash
npx @kekkai/blueprint deps                      # leaderboard: every unit by fan-in
npx @kekkai/blueprint deps hooks/useCart        # one unit, by unit key
npx @kekkai/blueprint deps src/hooks/useCart/useCart.ts   # same query, by file path
```

All three input forms resolve to the same unit key — with or without the `src/`
prefix, with or without the file extension.

- `--json` — machine-readable output (for tooling or an AI agent)
- `--framework vue|react` — force the preset when no config exists and detection is ambiguous

## What you will see

**Without a target** — the blast-radius leaderboard, every unit sorted by how many
units import it. The most dangerous unit to touch sits on top:

```
Blast radius (imported-by count):
  2 ← hooks/useCart
  1 ← services/api
  0 ← containers/Cart
  0 ← pages/Home
  (outside the declared architecture, invisible to deps: legacy/)
```

**With a target** — both directions at once. `imported by` is the blast radius of
changing it; `imports` is what it stands on:

```
hooks/useCart
  imported by (2):
    ← containers/Cart
    ← pages/Home
  imports (1):
    → services/api
```

**With `--json`** — the same data, structured. The leaderboard payload is
`{ units, skipped }`; a target query returns a single unit object:

```json
{
  "unit": "hooks/useCart",
  "importedBy": ["containers/Cart", "pages/Home"],
  "imports": ["services/api"]
}
```

An unknown target exits `1` with a pointer back to the leaderboard; every successful
query exits `0`.

## Granularity — set by `layer.layout`

The unit of every answer follows each layer's `layout`:

- **`folder` layout** — each direct child of the layer is one unit
  (`hooks/useCart`, `components/HelloWorld`). Direct files drop their extension, so
  `deps components/HelloWorld` and `components/HelloWorld.vue` name the same unit.
- **`file` layout** — preserving the former flat-layout behavior, the whole layer
  collapses to **one node**. This fits layers whose nested folders are not units — a Next.js route tree, for example, where
  `app/(marketing)/pricing/page.tsx` is a route, not a feature folder. Deps says so
  explicitly rather than silently switching granularity:

```
app (file-layout layer — answers at layer granularity)
```

## What is in the graph — and what is not

- **Declared architecture only.** In layer-first configs, folders outside
  `architecture.layers` are not scanned into the graph. In module-first configs,
  the same is true of folders outside `architecture.modules` and inner folders outside
  the shared `architecture.layers`; the leaderboard lists them as skipped (see `legacy/`
  above) so a zero
  fan-in is never misread as "nobody imports this". Querying into one fails with the
  reason: `✗ "legacy/" is outside the declared architecture`.
- **Test files are excluded** (`architecture.testFiles`) — a test importing a unit
  adds nothing to its blast radius, matching the lint side. That holds as far as the
  globs reach: a scanned test no declared glob matches is ordinary source on both
  sides, so its import counts.
- **Only alias and relative imports form edges.** Package imports (`axios`, `vue`)
  are not part of the unit graph — package *ownership* is `inspect`'s job.
- **Cycles are listed, not judged.** Two units importing each other simply show up
  in each other's fan-in and fan-out; the verdict belongs to `inspect`.

## Config validation

A hand-written `blueprint.config.mjs` that skips `defineBlueprint` is validated on
load anyway. A structural mistake fails immediately with a precise message instead of
crashing mid-command:

```
✗ blueprint.config.mjs: architecture.module is retired in Blueprint 4.0 — move layout and entry onto each layer.
```
