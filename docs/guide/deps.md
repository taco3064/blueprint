# Blast Radius — `blueprint deps`

`blueprint deps` answers one question before you touch a module: **who gets hit if I
change this?** It is read-only, needs no setup beyond the blueprint itself, and never
writes a file.

It is the day-to-day companion to [`blueprint inspect`](/guide/getting-started#brownfield-—-blueprint-inspect):
`inspect` **judges** the architecture (violations, cycles, exit 1), `deps` only
**describes** it — fan-in and fan-out per module, no verdict attached.

## How to run it

```bash
npx @kekkai/blueprint deps                      # leaderboard: every module by fan-in
npx @kekkai/blueprint deps hooks/useCart        # one module, by module key
npx @kekkai/blueprint deps src/hooks/useCart/useCart.ts   # same query, by file path
```

All three input forms resolve to the same module key — with or without the `src/`
prefix, with or without the file extension.

| Flag | Effect |
| --- | --- |
| `--json` | Machine-readable output (for tooling or an AI agent) |
| `--framework vue\|react` | Force the preset when no config exists and detection is ambiguous |

## What you will see

**Without a target** — the blast-radius leaderboard, every module sorted by how many
modules import it. The most dangerous file to touch sits on top:

```
Blast radius (imported-by count):
  2 ← hooks/useCart
  1 ← services/api
  0 ← containers/Cart
  0 ← pages/Home
  (not under a declared layer, invisible to deps: legacy/)
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
`{ modules, skipped }`; a target query returns a single module object:

```json
{
  "module": "hooks/useCart",
  "importedBy": ["containers/Cart", "pages/Home"],
  "imports": ["services/api"]
}
```

An unknown target exits `1` with a pointer back to the leaderboard; every successful
query exits `0`.

## Granularity — set by `module.layout`

The unit of every answer is the **module**, and what counts as a module follows the
blueprint's [`module.layout`](/api/interfaces/ModuleDef) (per layer, via
`layer.module`):

- **`folder` layout** — each direct child of the layer is one module
  (`hooks/useCart`, `components/HelloWorld`). Direct files drop their extension, so
  `deps components/HelloWorld` and `components/HelloWorld.vue` name the same module.
- **`flat` layout** — the whole layer collapses to **one node**. This fits layers
  whose nested folders are not modules — a Next.js route tree, for example, where
  `app/(marketing)/pricing/page.tsx` is a route, not a feature folder. Deps says so
  explicitly rather than silently switching granularity:

```
app (flat layer — answers at layer granularity)
```

## What is in the graph — and what is not

- **Declared layers only.** Folders outside `architecture.layers` are not scanned into
  the graph; the leaderboard lists them as skipped (see `legacy/` above) so a zero
  fan-in is never misread as "nobody imports this". Querying into one fails with the
  reason: `✗ "legacy/" is not a declared layer`.
- **Test files are excluded** (`architecture.testFiles`) — a test importing a module
  adds nothing to its blast radius, matching the lint side.
- **Only alias and relative imports form edges.** Package imports (`axios`, `vue`)
  are not part of the module graph — package *ownership* is `inspect`'s job.
- **Cycles are listed, not judged.** Two modules importing each other simply show up
  in each other's fan-in and fan-out; the verdict belongs to `inspect`.

## Config validation

A hand-written `blueprint.config.mjs` that skips `defineBlueprint` is validated on
load anyway. A structural mistake fails immediately with a precise message instead of
crashing mid-command:

```
✗ blueprint.config.mjs: architecture.module.private must be an array.
```
