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

Nothing else — the package itself has zero runtime dependencies.

## What `inspect` reports

Any `error`-level finding exits `1`; `warn` and `info` inform
without failing the gate. Test files (`architecture.testFiles`) are exempt throughout.

Some of these answer only under one [root structure](/guide/structure), and carry
**flat only** or **modules only** below. Under `modules` a layer is a folder inside a
module, so the two vocabularies do not overlap and no repo ever meets all twenty.

- **`structure-mismatch`** · error — the tree on disk matches one structure model and the config declares the other. It reports before any single declaration is judged, because declaring the folders as they stand goes green over a list copied off the disk
- **`undeclared-folder`** · error · flat only — a top-level source folder that is not a declared layer
- **`undeclared-module`** · error · modules only — a top-level source folder that is not in `architecture.modules`. Nothing inside it is governed: the layer globs are expanded from the declared list, so no glob matches in there and every structural ban is inert — with lint green throughout
- **`flow-violation`** · error — an upstream import, or a same-layer import via the alias
- **`deep-import`** · error — an alias import reaching *inside* a folder unit instead of through its entry. Under `modules` the same id also answers one level up — reaching inside a module rather than through `~app/<Module>` — and each message names the level it means
- **`src-escape`** · error — a relative path climbing above the source root. Use the project alias
- **`entry-bypass`** · error — a relative path reaching past a sibling's entry. `../Sibling` is the only legal spelling of a same-layer edge; the alias form (`~app/{ownLayer}/Sibling`) stays banned, which is why a sibling *is* reachable and only one way
- **`layer-escape`** · error — a relative path leaving its own layer. Use the alias, or extract the shared code to a lower layer
- **`root-import`** · error · modules only — a layer reaching up to its own module root, by relative path or any alias spelling. The root composes the layers, so the traffic runs downward only
- **`module-escape`** · error · modules only — a relative path crossing a module boundary. A module boundary is crossed through the alias or not at all
- **`undeclared-dependency`** · error · modules only — a cross-module import the importing module never named in its `imports`. A module reaches nothing it has not declared, and may only name modules declared after it
- **`package-ownership`** · error — importing an owned package (or restricted named import) from a non-owner. Two levels answer under this id: a layer's `owns` bars every other layer, and under `modules` a module's `owns` bars every other module
- **`selfonly-reexport`** · error — re-exporting a dependency marked `selfOnly` — depend on it, never pass it on
- **`module-reexport`** · error · modules only — passing another module's public surface through your own, in any spelling. A consumer that needs it declares that module itself. A wrapper expressing this module's own responsibility is fine; one added only to clear the rule goes green and builds nothing
- **`cycle`** · error — a module-level import cycle, with the whole loop listed. Every independent cycle is reported, one per knot of mutually dependent modules — so the count is the size of the work, not the first thing found. Its address is a **module key** — `components/A`, where every other finding's path is relative to the project root (`src/components/A`) — and a module key is what [`blueprint deps`](/guide/deps) takes, so the address pastes straight into that command
- **`no-entry`** · warn — a folder unit without its public entry file — nothing is importable from outside. Under `modules` the same id also answers one level up: a declared module whose folder holds code but carries no entry of its own. Each message names the level
- **`missing-layer`** · info — a declared layer with no folder on disk yet; under `modules`, one that holds no code in any module yet. Runway, not a todo: the rules arm when code lands, and keeping the declaration is the default
- **`missing-module`** · info · modules only — a declared module with no folder yet. Its globs and bans are emitted and correct, they simply have nothing to reach. Building it and dropping the declaration are both resolutions
- **`owns-not-installed`** · info — an `owns` entry naming a package that is not in `package.json` — the ban is emitted and correct, it simply has nothing to reach yet. Installing the package and dropping the declaration are both resolutions. The note is addressed at whichever level declared it, a layer or a module
- **`declaratory-self-only`** · info — a `selfOnly` ban protecting a layer that holds no files — the re-export ban cannot fire until code lands

On brownfield repos the [baseline ratchet](/guide/getting-started#brownfield-—-blueprint-inspect)
turns this list into "fail only on *new* findings". A baselined finding is identified by
its rule, its path and its **subject** — the import specifier, a cycle's members — never
by its message text, so a release that rewords a finding does not turn your gate red.
The file carries that key's `"version"`, and one written before the key moved is
[refused with the command that re-keys it](/guide/getting-started#upgrading-with-a-baseline-already-on-disk)
rather than reinterpreted.

### How the import graph is read

Every finding above that mentions an import is read out of a graph built from **source
text, not a parsed AST**. A computed specifier (`import(path)`, `require(name)`), the
individual names behind `import * as`, and import-like text inside a string are outside
what it can see. `inspect` and `deps` both close on this note, because a clean report is
where it matters most.

The **hard gates do not share the limit**: they run in ESLint, on the AST. So `inspect`
is the survey and your lint run is the authority on any single import — which is also
why `blueprint inspect` alone is not the gate.

## The embedded ESLint plugin

`emitLint` ships custom rules inside the generated config — nothing extra to
install. Three are structural and no `blueprint.rules` id opens them; the rest are
gated by `blueprint.rules` ids.
The plugin object is also exported (`import { plugin } from '@kekkai/blueprint'`)
as the escape hatch for wiring a `blueprint/*` rule by hand in a config that does
not spread `emitLint` — everyone else never needs it:

- **`blueprint/relative-escape`** · always (structural) — the depth-aware twin of inspect's relative family (`src-escape`, `entry-bypass`, `layer-escape`, `module-escape`, and `root-import`'s relative spelling): both call one `relativeVerdict`, so neither can reach a verdict the other would not
- **`blueprint/no-module-root-import`** · structural, emitted only under `architecture.modules` — a layer reaching up to its own module root at any alias spelling. Two spellings ride the entry's `paths` list; this covers the rest, including the root unit's own filename, which no pattern can enumerate
- **`blueprint/no-module-reexport`** · structural, emitted only under `architecture.modules` — passing another module's public surface through this one's. It follows the local *binding*, so the two-statement spelling and every rename are the same violation
- **`blueprint/no-deep-watch`** · `rules.deepWatch` — no `deep: true` watches; they traverse the whole source on every change (Vue preset: `error`)
- **`blueprint/use-prefix`** · `rules.usePrefix` — exported functions in the hook layer must carry the `use` prefix (layer and prefix configurable)
- **`blueprint/use-prefix-needs-reactivity`** · `rules.usePrefixReactivity` — a `use`-prefixed file must actually call a reactive or lifecycle API
- **`blueprint/test-filename-matches-source`** · `rules.testFilename` — a test file must have a co-located, same-named source sibling
- **`blueprint/no-typedef-only-file`** · `rules.typedefOnlyFile` — a JS file must not contain only `@typedef` declarations (attached to `.js` only)

Three further rules are **managed** — compiled from `layers` / `owns` / `alias` and
owned by the emitter: `no-restricted-imports`, `no-restricted-syntax`,
`no-restricted-globals`. They cannot be set through `lintOverrides`; change the
blueprint instead.

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
needs — one row per emitted entry, in two spellings, and only one of them survives a
paste:

- **`zone` says what a row governs, and it is not always a layer.** On a flat config
  there is one row per layer and every row carries `layer`. Under
  [`modules`](/guide/structure) there is one per (`module`, `layer`), plus one row per
  module zone — a layered module's own root (`zone: "root"`) or the whole of a
  `layers: false` module (`zone: "module"`) — and those two carry no `layer` and no
  selectors, since `allowedImporters` is a layer's field. Take the row for the entry you
  are combining with: a module is isolated by default, so a neighbour's selector is a
  different string, and pasting the wrong row installs a ban that matches nothing with
  lint green over it
- **`jsLiteral` is the one to copy** — the selector as JS source, quotes included
- **`selectors` is the value ESLint resolves.** Right for a program that *builds* a
  config, a trap for one that pastes: the path separators are `/` escapes (a bare
  `/` would end esquery's regex early), and JavaScript resolves that same escape when it
  parses a string literal — so the pasted selector ends at the bare `/`. No parse error,
  lint still green, and the ban silently matching nothing
- **`testExemptions` rides along and has to come with them.** Rebuilding an entry from
  the selectors alone drops it quietly in the worst way: the merged entry goes on
  linting, so the ban starts reaching your test files

The ban's *message* text is yours to write — `doctor` verifies selectors, never
messages.

One scope note that outlives the fold, because it is true of the check rather than of
your config: **doctor's survival check compares the import bans, the globals, the
module-root ban and the selfOnly selectors, plus the embedded `blueprint/*` rules that
are not a column in `rules` at all — not package ownership.** So a merge that drops a
package ban stays
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
- **`cycles`** → inspect's `cycle` finding (module-level; `import/no-cycle` was dropped from the generated config — a slow per-file re-check of the same graph) · error
- **`deepWatch` / `usePrefix` / `usePrefixReactivity` / `testFilename` / `typedefOnlyFile`** → the plugin rules above (see that section)

Any **other** id (e.g. `deadCode`) is documentation: it lands in the handbook and the
agent contract as a judgment the agent must hold, and is never presented as a hard
gate. That split is the [three-tier landing](/philosophy/#the-three-tier-landing).

This whole mapping is queryable in place: `npx blueprint rules` prints the catalog,
annotated with the declared tiers once a config exists. **A gate this stack cannot open
keeps its row and carries the reason** — `explicitAny` on a JS project, `testFilename`
beside `testFiles: []` — rather than being dropped without one. That is also why the
catalog has more rows than the `N/M optional gates` denominator `inspect` and `doctor`
print: those count the gates something could open, and a reader comparing the two
numbers is told which row accounts for the gap instead of guessing at it.

### Five gates ride an injected plugin

The library has **zero runtime dependencies**, so every id above that emits a
third-party rule needs its plugin handed to `emitLint` — and a gate whose plugin is
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
structural family** — `no-restricted-imports` / `-syntax` / `-globals`,
`blueprint/relative-escape`, and the two rules emitted under `architecture.modules`
(`blueprint/no-module-root-import`, `blueprint/no-module-reexport`). Every rule in the
list above keeps its own `blueprint.rules` tier — setting severity to `warn` does
**not** quiet `maxLines` or `unusedVars`.

## Config fields beyond the quick-start example

The `defineBlueprint` example in [Getting Started](/guide/getting-started#the-blueprint)
shows the core. The rest, one line each — full shapes in the
[API Reference](/api/):

### The load-bearing block

Everything the structural rules compile from. These keys predate the gate
catalog above, which is why most of them were only ever visible through
examples — the definitions belong here.

- **`architecture.alias`** — the project import root, e.g. `~app`. Required, with no default: a guessed alias silently passes illegal imports, because every structural ban pattern is built on this string
- **`architecture.layers`** — the ordered layers. **Order is the flow**: a layer may import only layers declared after it. Expressing direction as a sequence rather than a list of edges is what makes the graph one-way and acyclic by construction — a cycle is not something you are stopped from writing, it is something the shape cannot say
- **`layer.does`** — one line on what code in this layer is for. Feeds the handbook and the agent contract; no rule enforces it
- **`layer.mustNot`** — the things this layer may not do, in prose. Same destination, same lack of enforcement: it is what a reviewer and an agent read when a rule cannot decide
- **`layer.allowedImporters`** — narrows who may import this layer. Omit it and every earlier layer may; set it and only the listed ones may, each of which must be declared earlier — so narrowing can never introduce a back edge. Entries take `selfOnly` (may depend on this layer but never re-export it onward) and `description` (the edge label in the handbook diagram)
- **`layer.owns`** — primitives this layer exclusively owns; every other layer is barred from them. A bare string is a whole package (`'axios'`); the object form takes `imports` (specific named imports, e.g. `['createContext']`), `pattern` (treat the name as a glob group), and `exempt` (file globs excused). `{ global: 'fetch' }` owns a global instead of a package
- **`layer.layout` / `layer.entry`** — the unit shape, declared on the layer that has it. `layout` is `folder` (one folder per unit behind a public entry) or `file` (one file per unit); omitting it means `file`. `entry` is that entry's filename and defaults to `index`. Under `folder`, a sibling unit is reachable by its entry (`../Sibling`) and by nothing else — not past the entry, and not through the alias
- **`architecture.modules`** — feature modules at the source root, with the layers above describing what sits inside each one. Omit it for the flat model, where `src/` is the single implicit module. Declaring it changes the vocabulary of the whole config, so it is a [day-one choice](/guide/structure). Each entry takes `does` (one-line responsibility), `imports` (the modules it may reach, each through that module's entry alone — omit for none, and every name must be a module declared *after* this one), `owns` (primitives this module holds against every other module), and `layers: false` (opt out of the inner layer vocabulary — how a routing module is expressed — which drops the inner flow and nothing else)

### Tuning


- **`architecture.sourceRoot`** — where layers live, relative to the project root. Default `src`; `.` for root-level layouts (e.g. Next.js without `src/`)
- **`architecture.additionalAliases`** — extra import roots beyond `alias` that participate in every structural ban
- **`architecture.testFiles`** — test glob(s) exempt from structural rules and metric gates (default `*.test.*` / `*.spec.*`). `[]` exempts nothing — tests inherit their layer's rules — and switches the `testFilename` gate off with it: that rule is scoped to the test globs, so an empty list leaves it no file to name. `blueprint rules` says so beside the gate.
- **`architecture.layerFiles` / `layerFilesIgnore`** — per-layer file globs when the framework defaults don't fit
- **`architecture.naming`** — naming conventions by concept (e.g. `{ hook: 'useX + reactivity' }`) — rendered into handbook + contract
- **`layer.lintOverrides`** — per-layer ESLint tweaks (the three managed rules excluded)
- **`emit.agents`** — contract distribution targets: `claude`, `agents`, `gemini`, `copilot`, `cursor`, `windsurf` (+ per-target `path`). Default `['claude', 'agents']`; `[]` emits none. Narrowing it makes the next init remove a stale contract that is wholly its own output (hand-edited files only get told)
- **`emit.handbook` / `emit.lint`** — output path for the handbook · severity of the **structural** rules only (metric rules keep their `rules` tiers)

## CLI flags

- **`init`** — `--agent claude|codex` (launch the authoring agent) · `--preset` (force the preset scaffold) · `--authoring` (force the playbook even on a small repo; opposite of `--preset`) · `--framework vue|react` · **`--structure flat|modular`** ([the root structure](/guide/structure) of a config init generates — **required** on a tree below the 10-file threshold, ignored when a `blueprint.config.mjs` already answers it, refused on Next.js) · `--no-install` · `--dry-run`
- **`survey`** — `--alias <name>` (when tsconfig-paths detection finds none) · `--json`
- **`inspect`** — `--baseline` · `--update-baseline` · `--framework vue|react` · `--json`
- **`impact`** — `--json`
- **`deps [target]`** — `--framework vue|react` · `--json`
- **`rules`** — `--json`
- **`doctor`** — `--json`

Every command also answers `--help`; the bare CLI answers `--version`.
