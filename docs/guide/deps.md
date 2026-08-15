# Blast Radius — `blueprint deps`

`blueprint deps` answers one question before you touch a module: **who gets hit if I
change this?** It is read-only, needs no setup beyond the blueprint itself, and never
writes a file.

It is the day-to-day companion to [`blueprint inspect`](/guide/getting-started#brownfield-—-blueprint-inspect):
`inspect` **judges** the architecture (violations, cycles, exit 1), `deps` only
**describes** it — fan-in and fan-out per module, no verdict attached.

Both read the same graph, and that graph is built from **source text, not a parsed
AST** — see [how the import graph is read](/guide/reference#how-the-import-graph-is-read).
A computed `import(path)` does not appear in a fan-in count, so treat a blast radius as
a floor rather than an exact number. Every `deps` output closes on that note.

## How to run it

```bash
npx @kekkai/blueprint deps                      # leaderboard: every module by fan-in
npx @kekkai/blueprint deps hooks/useCart        # one module, by module key
npx @kekkai/blueprint deps src/hooks/useCart/useCart.ts   # same query, by file path
```

All three input forms resolve to the same module key — with or without the file
extension, and with or without the prefix of the directory
[`architecture.sourceRoot`](/guide/reference#config-fields-beyond-the-quick-start-example)
names (`src/` by default, `app/` on a repo that sets it there). That prefix is how
[every finding but a cycle](/guide/reference#what-inspect-reports) prints its address, so
an address off the report pastes in exactly as `inspect` printed it.

- `--json` — machine-readable output (for tooling or an AI agent)
- `--framework vue|react` — force the preset when no config exists and detection is ambiguous

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
`{ modules, skipped, derivation }`; a target query returns a single node object:

```json
{
  "module": "hooks/useCart",
  "importedBy": ["containers/Cart", "pages/Home"],
  "imports": ["services/api"],
  "derivation": "How this graph was read: source text, not a parsed AST …"
}
```

`derivation` rides on every payload, both forms — it is the "what is in the graph"
caveat below as one string, so a tool reporting this graph carries the limit with it.

Under [`modules`](/guide/structure) each payload carries both granularities: the
leaderboard adds `units` beside `modules`, and a target query is keyed `unit`, with its
own `module` and that module's `moduleImportedBy` alongside.

An unknown target exits `1` with a pointer back to the leaderboard; every successful
query exits `0`.

## Granularity — set by `layer.layout`

The unit of every answer is the **module**, and what counts as a module follows the
[`layout`](/api/interfaces/LayerDef) declared on each layer:

- **`folder` layout** — each direct child of the layer is one module
  (`hooks/useCart`, `components/HelloWorld`). Direct files drop their extension, so
  `deps components/HelloWorld` and `components/HelloWorld.vue` name the same module.
- **`file` layout** — the whole layer collapses to **one node**. This fits layers
  whose nested folders are not modules — a Next.js route tree, for example, where
  `app/(marketing)/pricing/page.tsx` is a route, not a feature folder. Omitting
  `layout` resolves here. Deps says so explicitly rather than silently switching
  granularity:

```
app (file-layout layer — answers at layer granularity)
```

Under [`modules`](/guide/structure) there are two granularities and the leaderboard
prints both — modules at the root, then units inside their own module, whose keys
carry the module they live in:

```
Blast radius per module (imported-by count):
  1 ← common
  0 ← app

Blast radius per unit (inside its own module — imported-by count):
  1 ← app/hooks/useThing
  1 ← common/services/api
  0 ← app/components/Panel
```

## What is in the graph — and what is not

- **Declared layers only.** Folders outside `architecture.layers` are not scanned into
  the graph; the leaderboard lists them as skipped (see `legacy/` above) so a zero
  fan-in is never misread as "nobody imports this". Querying into one fails with the
  reason and both resolutions:

```
✗ "legacy/" is not a declared layer, so nothing governs it — the import graph holds no node inside it and there is no blast radius to report. Declare it in `architecture.layers`, or run `blueprint deps` for the nodes it does hold.
```
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
✗ blueprint.config.mjs: architecture.layers must be an array.
```

An unknown key is refused the same way, and says what replaced it — a 3.x config
still carrying `architecture.module` is the case that reaches this most:

```
✗ blueprint.config.mjs: Unknown key "module" in architecture — nothing reads it, so the declaration is silently dead. The module shape moved onto each layer in 4.0.0 — write `layout` / `entry` there instead: layers: [{ name: 'components', does: '…', layout: 'folder', entry: 'index' }] (entry defaults to "index", layout to "file"). `private` is gone with no replacement: the entry-only ban already covers every non-entry file, so nothing was enforcing it. Every 3.x config must make this edit, including a flat project that is not adopting `modules`.
```
