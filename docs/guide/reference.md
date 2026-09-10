# Checks & Config Reference

Everything blueprint can check, and every config field the guide pages don't walk
through — in one place. The [API Reference](/api/) has the full type signatures; this
page is the map.

## What it runs on

- **Node — minimum `^18.18.0 || ^20.9.0 || >=21.1.0`.** A floor that is executed rather
  than read off the source: CI builds on the current Node, then runs the built artifact
  on `18.18.0` exactly, because the floor is the version being claimed. **Recommended:
  the version this repo itself builds and tests on**, which lives in
  [`.nvmrc`](https://github.com/taco3064/blueprint/blob/main/.nvmrc) and is deliberately
  not copied here — a version number pasted into prose goes stale without anyone
  noticing. Anything above the floor works; that one is the best-travelled path
- **ESLint 9 or 10, on flat config** — both majors are admitted by every carrier
  plugin's peer range, so `init` installs `eslint` unpinned and it resolves to the
  newest supported one; CI runs the suite on
  [each of them](/guide/field-tested#what-backs-this-page), so the major you resolve
  to is one this project executes rather than one it merely permits. A legacy
  `.eslintrc` is a [migration decision](/guide/field-tested#framework-notes), never a
  silent half-adoption

Blueprint includes declared parser dependencies for JavaScript, TypeScript, and Vue so
dynamic import targets can be evaluated consistently after installation.

## What `inspect` reports

Any `error`-level finding exits `1`; `warn` and `info` inform
without failing the gate. Test files (`architecture.testFiles`) are exempt throughout —
as far as the globs reach: a scanned file no declared glob matches is inspected as ordinary source.

- **`undeclared-folder`** · error — a source folder outside the declared topology: an undeclared top-level layer in layer-first mode, or an undeclared outer module / inner layer in module-first mode
- **`flow-violation`** · error — a module-reachability or inner-flow failure, including an upstream import or a same-layer alias import inside one module. Same-layer imports across reachable modules remain valid
- **`canonical-alias`** · error — a cross-layer or cross-module import uses an `additionalAliases` spelling instead of `architecture.alias`
- **`deep-import`** · error — an alias import reaching *inside* a folder unit instead of through its entry
- **`relative-escape`** · error — a relative import that leaves its own layer, escapes the source root, or reaches past a sibling unit's entry. Under `folder` layout a sibling *is* reachable — `../Sibling` is how one unit uses another inside the same layer, and the only way, since the alias spelling (`~app/{ownLayer}/Sibling`) stays banned
- **`package-ownership`** · error — importing a layer-owned package (or restricted named import) from a non-owner layer
- **`selfonly-reexport`** · error — re-exporting a dependency marked `selfOnly` — depend on it, never pass it on
- **`cycle`** · error — a unit-level import cycle, with the full path listed. Every independent cycle is reported, one per knot of mutually dependent units — so the count is the size of the work, not the first thing found
- **`no-entry`** · warn — a folder unit without its public entry file — nothing is importable from outside
- **`missing-module`** · info — a declared module that has no folder on disk yet (module-first only)
- **`missing-layer`** · info — a declared layer that has no folder on disk yet (layer-first only). Module-first does not require every shared layer position to be scaffolded; an absent position remains runway until code lands
- **`owns-not-installed`** · info — a layer `owns` a package that is not in `package.json` — the ban is emitted and correct, it simply has nothing to reach yet. Installing the package and dropping the declaration are both resolutions
- **`declaratory-self-only`** · info — a `selfOnly` ban protecting a layer that holds no files — the re-export ban cannot fire until code lands

On brownfield repos the [baseline ratchet](/guide/getting-started#brownfield-—-blueprint-inspect)
turns this list into "fail only on *new* findings". A baselined finding is identified by
its rule, its path and its **subject** — the import specifier, a cycle's members — never
by its message text, so a release that rewords a finding does not turn your gate red.
The file carries that key's `"version"`, and one written before the key moved is
[refused with the command that re-keys it](/guide/getting-started#upgrading-with-a-baseline-already-on-disk)
rather than reinterpreted.

### How the import graph is read

Static imports and re-exports are read from source text. Dynamic `import()` calls are
parsed, and literal targets plus immutable constants, concatenations, and templates
that reduce to a proven string join the same graph. Reassigned or shadowed bindings and
runtime-dependent expressions are deliberately omitted; `inspect` and `deps` disclose
their exact count (and any parse failures) instead of calling them legal.

## The embedded ESLint plugin

`emitLint` ships custom rules inside the generated config — nothing extra to
configure. Two are structural and always on; the rest are gated by `blueprint.rules` ids.
The plugin object is also exported (`import { plugin } from '@kekkai/blueprint'`)
as the escape hatch for wiring a `blueprint/*` rule by hand in a config that does
not spread `emitLint` — everyone else never needs it:

- **`blueprint/relative-escape`** · always (structural) — the depth-aware twin of inspect's finding: both call one `relativeVerdict`, so neither can reach a verdict the other would not
- **`blueprint/import-boundary`** · always (structural) — requires `architecture.alias` across layer/module boundaries and applies the same module, layer, and folder-entry verdicts to statically resolvable dynamic imports
- **`blueprint/no-deep-watch`** · `rules.deepWatch` — no `deep: true` watches; they traverse the whole source on every change (Vue preset: `error`)
- **`blueprint/use-prefix`** · `rules.usePrefix` — exported functions in the hook layer must carry the `use` prefix (layer and prefix configurable)
- **`blueprint/use-prefix-needs-reactivity`** · `rules.usePrefixReactivity` — a `use`-prefixed file must actually call a reactive or lifecycle API
- **`blueprint/test-filename-matches-source`** · `rules.testFilename` — a test file must have a co-located, same-named source sibling
- **`blueprint/no-typedef-only-file`** · `rules.typedefOnlyFile` — a JS file must not contain only `@typedef` declarations (attached to `.js` only)

Three further rules are **managed** — compiled from `layers` / `owns` / `alias` and
owned by the emitter: `no-restricted-imports`, `no-restricted-syntax`,
`no-restricted-globals`. They cannot be set through `lintOverrides`; change the
blueprint instead. Dependency-flow bans, same-layer bans, and `selfOnly` re-export
selectors cover both the bare layer entry and its descendants through every declared
alias. This does not widen a folder unit's public surface: an allowed importer may
still use a unit entry, but not anything behind that entry.

### Folding a managed entry into a house rule

Flat config **replaces** rather than merges — on the files both entries match — so a
repo that already sets `no-restricted-syntax` cannot let the later entry win there: both
option sets have to become one entry. Only *there*, though. An entry does nothing to a
file outside its own `files`, so the spread keeps enforcing blueprint's entry wherever
yours does not reach, and a scope mismatch is resolved by scoping the combined entry to
the overlap rather than by widening either side to meet the other. Your own entry stays
where it is and keeps the files blueprint never governed: put the combined entry **last
in the array** — after the spread and after that entry both, since later still wins
wherever both match — and nothing you already had has to move.

`npx blueprint rules --json` carries the exact `selfOnly` selectors that combined entry
needs, per layer, in two spellings — and only one of them survives a paste:

- **`jsLiteral` is the one to copy** — the selector as JS source, quotes included
- **`selectors` is the value ESLint resolves.** Right for a program that *builds* a
  config, a trap for one that pastes: the path separators are `/` escapes (a bare
  `/` would end esquery's regex early), and JavaScript resolves that same escape when it
  parses a string literal — so the pasted selector ends at the bare `/`. No parse error,
  lint still green, and the ban silently matching nothing
- **`testExemptions` rides along and has to come with them.** Rebuilding an entry from
  the selectors alone drops it quietly in the worst way: the merged entry goes on
  linting, so the ban starts reaching the test files those globs reach

The ban's *message* text is yours to write — `doctor` verifies selectors, never
messages.

One scope note that outlives the fold, because it is true of the check rather than of
your config: **doctor's survival check compares the import bans, the globals and the
selfOnly selectors — not package ownership.** So a merge that drops a package ban stays
green there, and that column is yours to verify. `blueprint rules` names the command
for it, on the layers where you actually own a package.

## `blueprint.rules` — which ids actually gate

A rule id in `blueprint.rules` becomes a lint gate only if the machine can check it.
The gated set:

- **`maxLines`** → `max-lines` · error · 400
- **`maxLinesPerFunction`** → `max-lines-per-function` · warn · 100
- **`maxParams`** → `max-params` · warn · 3
- **`maxStatements`** → `max-statements` · warn · 15
- **`complexity`** → `complexity` · warn · 12
- **`unusedVars`** → `no-unused-vars` (TS-aware when the project is TS) · error
- **`explicitAny`** → `@typescript-eslint/no-explicit-any` · error
- **`codeStyle`** → `@stylistic`'s `customize()` set plus `max-len`, `linebreak-style` and core `curly` — ~68 rules · error
- **`statementsPerLine`** → `@stylistic/max-statements-per-line` at a hard-wired `{ max: 1 }` · error
- **`statementPadding`** → `@stylistic/padding-line-between-statements` with a fixed 17-entry option list · error
- **`importBlock`** → `import-x/first` + `import-x/no-duplicates` · error
- **`fixtureImports`** → restricted fixture imports in production code · error (vue preset)
- **`cycles`** → inspect's `cycle` finding (unit-level, diagnosed only when inspect runs; a baseline grandfathers recorded findings). The generated config leaves continuous prevention off by default; [opt into `import-x/no-cycle`](/guide/generated-artifacts#claude-md-agents-md-—-collaborate) when its per-file graph cost is acceptable · error
- **`deepWatch` / `usePrefix` / `usePrefixReactivity` / `testFilename` / `typedefOnlyFile`** → the plugin rules above (see that section)

Any **other** id (e.g. `deadCode`) is documentation: it lands in the handbook and the
agent contract as a judgment the agent must hold, and is never presented as a hard
gate. That split is the [three-tier landing](/philosophy/#the-three-tier-landing).

This whole mapping is queryable in place: `npx blueprint rules` prints the catalog,
annotated with the declared tiers once a config exists. **A gate that cannot be opened
here keeps its row, marked `unavailable here`, and its cause is printed on a line of its
own above the rows** — `explicitAny` on a JS project, `testFilename` beside
`testFiles: []` — rather than being dropped without one. That is also why the
catalog has more rows than the `N/M optional gates` denominator `inspect` and `doctor`
print: those count the gates something could open, and a reader comparing the two
numbers is told which row accounts for the gap instead of guessing at it.

### Five gates ride an injected plugin

Every id above that emits a third-party ESLint rule still needs its plugin handed to
`emitLint` — Blueprint's parser dependencies do not bundle those rules. A gate whose plugin is
missing **emits nothing while lint still passes**, which reads exactly like a clean
merge. The generated config wires all three plugins and `init` installs them; a
hand-merged config has to carry the argument itself:

```js
import stylistic from '@stylistic/eslint-plugin';
import imports from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

export default [
  /* …your entries */
  ...emitLint(blueprint, { typescript: tseslint.plugin, stylistic, imports }),
];
```

- **`explicitAny`** needs `typescript`. Unlike `unusedVars` there is no core rule to
  fall back to — `any` is a TypeScript construct, so on a JS project the gate is
  meaningless and `inspect` drops it from the coverage denominator rather than
  reporting a gate nobody can open.
- **`codeStyle`**, **`statementsPerLine`** and **`statementPadding`** need
  `stylistic`. ESLint's own formatting rules were deprecated and frozen when it
  handed them to `@stylistic`, so emitting the core ids would ship rules slated for
  removal. `codeStyle` additionally reads the plugin's `configs.customize()` factory,
  and **throws** if it is absent rather than governing nothing.
- **`importBlock`** needs `imports`. Nothing in ESLint core or `@stylistic` merges
  duplicate imports.

### ESLint owns formatting here

`codeStyle` is not a convenience layer over a formatter — it *is* the formatter. Two
consequences worth stating plainly:

- **A red line is the whole enforcement mechanism.** No editor integration, no
  save-hook, no assumption about which editor anyone uses: the agent runs lint, reads
  the red, and fixes it. Roughly 5 of the ~68 rules have no autofix, so `eslint --fix`
  clears most of a first run and what remains is the part that needed judgment.
- **A repo that already runs its own formatter is the overlapping-tool case.** Keep
  one owner of formatting and record which. Rules configured under the same key on
  both sides collide mechanically — flat config replaces rather than merges.

Three details inside `codeStyle` that are deliberate rather than incidental:

- **`statementsPerLine` is what makes `maxLines` mean anything.** That gate counts
  code lines with blanks and comments skipped, so a line budget with no cap on line
  *content* is satisfiable by collapsing statements onto one line instead of splitting
  the file. `{ max: 1 }` is hard-wired for that reason — the gate's dial is its tier.
  `curly` closes the same route one level down: without it, `if (x) return;` counts as
  a single statement and slips through.
- **`max-len` does not exempt plain strings, and has no fixer.** A length cap a line
  escapes by containing a string is not a cap; and a too-long line has to be
  restructured, not reformatted.
- **`linebreak-style` is `unix`, and its red usually is not about the file.** Mixed
  line endings are what breaks cross-platform work, so LF everywhere is the stance —
  but the cause of a violation is normally git's `autocrlf` or a missing
  `.gitattributes`. Fix it there, or the next checkout undoes the autofix.

Knobs: `indent` (2), `quotes` (`single`), `semi` (`true`), `maxLen` (90) — declared on
the gate, e.g. `codeStyle: { tier: 'error', indent: 4, maxLen: 120 }`. Everything else
in the bundle is fixed; a repo that wants different braces turns the gate off and
declares its own set.

One scope note that bites in practice: **`emit.lint.severity` covers only the
structural family** (`no-restricted-imports` / `-syntax` / `-globals`,
`blueprint/relative-escape`, and `blueprint/import-boundary`). Every rule in the list above keeps its own
`blueprint.rules` tier — setting severity to `warn` does **not** quiet `maxLines` or
`unusedVars`.

## Config fields beyond the quick-start example

The `defineBlueprint` example in [Getting Started](/guide/getting-started#the-blueprint)
shows the core. The rest, one line each — full shapes in the
[API Reference](/api/):

### The load-bearing block

Everything the structural rules compile from. These keys predate the gate
catalog above, which is why most of them were only ever visible through
examples — the definitions belong here.

- **`architecture.alias`** — the sole canonical source-root spelling, e.g. `~app`. Required, with no default. Cross-layer and cross-module imports must use it
- **`architecture.modules`** — optional outer application modules, each mapped to a direct child of `sourceRoot`. When present, the complete `layers` list repeats under every ordinary module; global layer folders are not a second supported topology. The optional reserved module name `app` instead represents router composition recursively at the existing container position, independent of routing framework, and does not repeat the shared layers. A module's optional `dependsOn` lists its direct dependencies. Permission follows transitive reachability through that DAG, never declaration order; unknown modules, self-dependencies, duplicate edges, and cycles are invalid
- **`architecture.layers`** — the ordered shared layers. **Order is the flow**: a layer may import only layers declared after it. The declaration therefore cannot express a back edge. This makes the declared layer graph acyclic; it does not continuously prevent unit import cycles, which `blueprint inspect` diagnoses only when it runs
- **`layer.does`** — one line on what code in this layer is for. Feeds the handbook and the agent contract; no rule enforces it
- **`layer.mustNot`** — the things this layer may not do, in prose. Same destination, same lack of enforcement: it is what a reviewer and an agent read when a rule cannot decide
- **`layer.allowedImporters`** — narrows who may import this layer. Omit it and every earlier layer may; set it and only the listed ones may, each of which must be declared earlier — so narrowing can never introduce a back edge. Entries take `selfOnly` (may depend on this layer but never re-export it onward) and `description` (the edge label in the handbook diagram)
- **`layer.owns`** — primitives this layer exclusively owns; every other layer is barred from them. A bare string is a whole package (`'axios'`); the object form takes `imports` (specific named imports, e.g. `['createContext']`), `pattern` (treat the name as a glob group), and `exempt` (file globs excused). `{ global: 'fetch' }` owns a global instead of a package
- **`layer.layout`** — unit layout for this layer: `folder` keeps each unit behind its public entry; `file` preserves flat layer-granularity dependency and relative-import semantics
- **`layer.entry`** — public entry filename for folder units (default `index`). A sibling folder unit is reachable by its entry (`../Sibling`) and by nothing else — not past the entry, and not through the alias

### Tuning


- **`architecture.sourceRoot`** — where layers live, relative to the project root. Default `src`; `.` for root-level layouts (e.g. Next.js without `src/`). Lint, inspect, init scaffolding, deps targets, and generated agent placement guidance all resolve source paths from this root. Before a config exists, survey can infer a root-level layout from TypeScript includes; a workspace with several application roots asks you to choose this field explicitly.
- **`architecture.additionalAliases`** — extra roots used to resolve existing imports for diagnosis and dependency graphs. They may target the source root, an ancestor, module, layer, or unit, but are illegal alternate spellings across a layer or module boundary; use `architecture.alias` there.

Without `architecture.modules`, one blueprint models the traditional layer-first axis.
With it, Blueprint models a Module → Layer → Unit topology and repeats the same layer
contract inside every ordinary declared module. A declared `app` module is optional and reserved
for router composition; every governed source file below it uses the container position instead of
an inner layer. A governed import must pass both the module DAG and
the shared inner layer flow. Same-layer imports across reachable modules remain valid; relative
imports still cannot cross a module or layer boundary.
- **`architecture.testFiles`** — test glob(s) exempt from structural rules and metric gates (default `*.test.*` / `*.spec.*`). `[]` exempts nothing — tests inherit their layer's rules — and switches the `testFilename` gate off with it: that rule is scoped to the test globs, so an empty list leaves it no file to name. `blueprint rules` says so beside the gate. A declared glob that matches no file costs the exemption but not the gate: nothing the run read is exempt through it.
- **`architecture.layerFiles`** — per-layer file globs when the framework defaults don't fit
- **`architecture.layerFilesIgnore`** — global file globs excluded from emitted lint and lint-backed `inspect` findings. The files remain visible to inspect-only checks such as undeclared folders and cycles, and coverage names them as deliberately ignored rather than reached

The portable glob dialect across lint and inspect is `/`-separated paths with `**`,
`*`, `?`, and flat brace alternatives such as `*.{ts,tsx}`; `layerFiles` additionally
replaces `{layer}` with each declared layer name. Module-first custom patterns must also
contain `{module}`; Blueprint expands the module × layer product. Negation, character classes, extglobs,
and nested braces are outside that shared dialect. Keep to the portable subset so lint
and inspect select the same files.
- **`architecture.naming`** — naming conventions by concept (e.g. `{ hook: 'useX + reactivity' }`) — rendered into handbook + contract
- **`layer.lintOverrides`** — per-layer ESLint tweaks (the three managed rules excluded)
- **`emit.agents`** — contract distribution targets: `claude`, `agents`, `gemini`, `copilot`, `cursor`, `windsurf` (+ per-target `path`). Default `['claude', 'agents']`; `[]` emits none. Narrowing it makes the next init remove a stale contract that is wholly its own output (hand-edited files only get told)
- **`emit.handbook` / `emit.lint`** — output path for the handbook · severity of the **structural** rules only (metric rules keep their `rules` tiers)

## CLI flags

- **`init`** — `--agent claude|codex` (launch the authoring/transformation agent) · `--topology layer-first|module-first` (select an unprovable topology; a module-first target enters authoring on a new tree, or a Git-preflight-guarded Agent transformation on an existing layer-first application; it cannot use `--preset` and never automatically assigns domain ownership or moves source) · `--preset` (force the layer-first preset scaffold) · `--authoring` (force the playbook even on a small repo; opposite of `--preset`) · `--framework vue|react` · `--no-install` · `--dry-run`

Layer-first → module-first transformation requires one selected application, a clean Git worktree,
a recoverable committed `HEAD`, and usable pre-transform inspection evidence. Its playbook carries
container/page candidate closures separately from page/App Router composition closures, canonical
inspect/deps unit edges, unmatched alias-like imports, bounded relative-path evidence, Git movement
rules, cutover gates, and baseline review. Exact relative file resolution and runtime-dependent
imports remain disclosed limits. The Agent decides domain names, ownership, merge/split, neutral
extraction, cycles, and collisions, then uses `git mv` and rewrites imports. Next.js App Router keeps its
physical `app/**`; Pages Router is rejected because that direction requires a framework router
migration. Module-first → layer-first is not delivered yet and still aborts before mutation.
- **`survey`** — `--alias <name>` (when tsconfig-paths detection finds none) · `--source-root <path>` (select one application in a workspace) · `--json`
- **`inspect`** — `--baseline` · `--update-baseline` · `--framework vue|react` · `--json`
- **`impact`** — `--json`
- **`deps [unit]`** — `--framework vue|react` · `--json`
- **`rules`** — `--json`
- **`doctor`** — `--json`

Every command also answers `--help`; the bare CLI answers `--version`.
