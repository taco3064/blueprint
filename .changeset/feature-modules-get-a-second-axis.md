---
"@kekkai/blueprint": major
---

**Add `architecture.modules`** — ordered feature modules at the source root, each a
folder holding the declared `architecture.layers` nested one level inside it (or, with
`layers: false`, its files directly). Omitting `modules` leaves the flat structure
exactly as it is today, byte-for-byte — the two config surfaces coexist by
construction: `layers` is always the technical-layer definition, `modules` only
decides *where* those layers live.

- **The schema.** `name` / `does` (parallel `layer.name` / `layer.does`), `layers?:
  false` (the only opt-out — omit it to nest the shared layers, `false` for a module
  that holds its files directly), `owns?` (same shape as `layer.owns`, and it
  cascades: a file group may reach a primitive its own layer owns *or* its owning
  module owns), `allowedImporters?` (same shape and default as
  `layer.allowedImporters` — a module declared earlier may import a module declared
  later by default; entries name a `module`, not a `layer`), `entry?` (override the
  module's own public entry filename, inheriting `architecture.folder.entry` when
  unset).
- **Entry-only, in both directions.** A module is reachable from outside only at its
  bare alias path (`~app/N`); reaching past it (`~app/N/**`) is caught, whichever
  shape the target module is. From inside, the module's own alias spelling has to
  stay relative too (`~app/N` banned, `./` is not) — but a declared layer nested
  inside is still reachable at `~app/N/<layer>`, the modular restatement of the flat
  model's own cross-layer alias import. A module's own root file may relatively
  import anything inside its own module, unconstrained; an inner layer relatively
  reaching back to its own module's root files is caught the same way leaving any
  other layer is.
- **`selfOnly` at both depths.** A layer's `allowedImporters` entry can still mark
  `selfOnly` within a module; a module's own `allowedImporters` entry can mark it too
  — an importer may depend on the module but never re-export it onward, caught even
  at the module's bare entry spelling, not only one segment deeper.
- **No `imports` field.** An earlier draft proposed isolation by default (every
  cross-module edge hand-declared). Reconfirmed against `allowedImporters`'
  declared-order-implies-default-permission instead, matching the layer model
  exactly — a module boundary still deserves a greppable edge where one narrows, but
  forcing every edge (not just the exception) to be written out breaks the
  "majority direction is free" authoring flow the rest of this tool depends on.

**`deps`, `rules`, `doctor`, and `impact` now agree with `emitLint` about what a
modular repo governs — they no longer silently mistake a module for a layer.**
Before this, all four assumed the flat structure: `moduleKey` / `buildModuleGraph`
read `segments[0]` as a layer name, so `blueprint deps` on a modular repo reported
an empty leaderboard (every file dropped by a filter that never matched); `inspect`
coverage and `blueprint impact` built their file nets from the bare layer globs
alone, so a module's files always read as ungoverned and `impact` always linted
zero files; `blueprint rules` had no module-axis section at all, so a cross-module
ban `emitLint` enforced was invisible to the catalog.

- `deps`: `moduleKey` / `buildModuleGraph` gain the module dimension in their
  segment arithmetic (module at `segments[0]`, layer at `segments[1]`, a
  folder-layout feature-folder at `segments[2]`) — the same either/or a module's
  own alias-reach already uses. `blueprint deps <target>` also strips a declared
  `sourceRoot` (single- or multi-segment) instead of a hardcoded `'src'`.
- `inspect` coverage and `impact`: both now build their file nets from
  `emitLint`'s own resolver (`resolveFileNets` / `allNetFiles`), so a module's own
  root files and its files nested a layer deep are counted and linted, not
  silently excluded for having no bare layer glob to match.
- `rules`: a new **Per-module bans** section, from the same `getForbiddenModules`
  primitive `emitLint` reads — the module-axis twin of the existing per-layer
  bans table.

**`doctor` and `rules --json` now agree with `emitLint` about a MODULE's owned
packages, globals, and selfOnly too — the first pass above closed the gap for
`deps` / `impact` / coverage and gave `rules` its module-flow section, but left
two narrower disagreements where a module's own `owns` / `allowedImporters`
diverged from what each still reported:**

- `doctor`'s merge-survival check (`wiringCheck`) resolved its probes AND its
  expectations from `architecture.layers` alone — one probe per bare layer name,
  built from `resolveLayerFiles('hooks', ...)`. Under a modular blueprint no real
  file ever matches that glob (a real file sits at `src/Combat/hooks/**`), so
  every probe missed and the check either read a false "lost" against files
  outside every real net, or — worse — proved nothing about a real module-scoped
  ban a merge had actually dropped. It now probes `resolveFileNets` — the same
  resolver `emitLint` compiles the config from, so a probe exists for a module's
  own root files and for each layer nested inside it — and builds its
  expectations from `emit/lint/bans.ts`'s own `resolveBanScope` / `netPatterns` /
  `netSelfOnly` / `netModuleSelfOnly` / `barredIn`, the exact functions `emitLint`
  itself compiles from, so the expectation and the real output are one function
  call rather than two hand-rolled ones that happened to agree. A merge that
  silently drops a module-scoped ban is now reported lost, by the net's name
  (`Combat`, or `Combat/hooks`), not silently green.
- `rules --json`'s per-layer view (`layerBans`) and its structural `active` flags
  (`resolveStructural`) read `architecture.layers` alone too — `!rule.allowedIn`
  `.includes(layer.name)`, never the layer's owning module. A selfOnly importer or
  an owned package/global declared only on a MODULE (stage 2's own cascade,
  already live in `emitLint`) reported `active: false` for a rule the emitted
  config actually carries, and a layer nested inside the owning module still
  showed the owned thing as banned there. Both now read the governed nets rather
  than the declarations: `no-restricted-globals` and the per-net package/global
  columns through `resolveBanScope`'s combined layer+module facts and `barredIn`,
  `no-restricted-syntax` through each net's own `netSelfOnly` /
  `netModuleSelfOnly` — so a selfOnly that no net actually carries (every module
  `layers: false`, leaving no net with a layer to hang it on) reports inactive,
  matching an emitted config that carries no such rule. Since the same bare
  layer name can be nested inside more than one module with a different cascade
  in each, `layerBans` now carries one row per net rather than one per bare layer
  name — a new `module` field on each row, and the printed/JSON `layer` label
  reads `Combat/hooks` once a row is module-nested, so two rows sharing a bare
  name stay distinguishable. `moduleBans` (the per-module flow section above) is
  unchanged.
- **`rules`' selfOnly selectors are now the ones a modular repo can actually
  paste.** `layerBans.selfOnly` built its selector from the bare layer name, so it
  printed `~app/contexts/…` — but inside a module the target really sits at
  `~app/Combat/contexts/…`. That column exists to be copied into a hand-merged
  flat config (`jsLiteral` exists solely so the paste survives), and `doctor`'s own
  failure message names `blueprint rules --json` as where to get "the exact
  selfOnly selectors" — so on a modular repo the one string this whole column is
  for matched no file it was meant to guard and silently protected nothing, while
  lint stayed green. It now comes from `emit/lint/bans.ts`'s `netSelfOnly` /
  `netModuleSelfOnly` per net, the same functions `emitLint` emits from, and
  module-level `selfOnly` (an `allowedImporters` entry on a MODULE) is reported at
  all for the first time — with `selfOnlyModuleReexportSelector`, which also
  matches a module's bare entry spelling, not only one segment deeper.
- **A module's own root files, and a `layers: false` module, get a row at all.**
  `layerBans` skipped every net with no layer, so a layered module's root-file
  group was missing and a `layers: false` module appeared in **no section of the
  catalog whatsoever** — `moduleBans` carries `forbidden` only, so the packages
  and globals it is barred from, and the same-module rule that its own files be
  reached relatively rather than through the alias, were reported nowhere. Those
  nets carry real bans (verified against `netPatterns` / `netSelfBanPaths`), so
  they are now rows, keyed by the bare module name, with a paragraph naming what
  such a row is (root files, or the whole module) and why its `no-import` is
  always `(none)`. `LayerBans.layer` is now `string | null` to carry them.
- Both outputs name a net the same way, through one shared `netLabel` in
  `emit/lint/nets.ts`: `doctor` reddens with `Lobby: no-restricted-imports lost …`
  and `rules` keys that net's row `Lobby`. Its own failure message sends the
  reader from the first to the second, and two spellings of one net's name was a
  bridge that reader had to build themselves.
- **`rules`' Per-module bans header no longer under-claims doctor.** It said the
  section was "NOT compared by doctor's survival check — that check is layer-scoped
  only", which the fix above makes false: `expectedStructural` now routes through
  `netPatterns`, which composes the cross-module flow bans, so a merge that drops
  one reddens by net name. It now says so, and states the narrower boundary that
  really does remain — the same-module rule's bare-entry half (`~app/<module>` as
  an exact `paths` entry; the check reads `patterns` only), which is what
  `--print-config` is still for there. The separate `packages` caveat is unchanged
  and still true: package ownership is genuinely not compared.

**`inspect`'s own finding engine now reads both depths, so a modular repo stops
being misreported — loudly and quietly.** `analyze` built its whole world from
`architecture.layers.map(…)` and every finding path read that one array. The loud
half: on a correctly-declared 2-module fixture the previous code reported 2
`undeclared-folder` **errors** against `src/App/` and `src/common/` — the module
folders the config declares — plus a `missing-layer` note per layer, aimed at
source-root folders a modular repo must not have. The quiet half was worse. The
per-file import checks early-returned on every file whose `segments[0]` was not a
declared layer, which under a modular structure is **every file there is** — so a
modular repo got no import finding at all, for any file, with nothing on screen
saying so. Measured on a 10-file fixture carrying five real violations, `inspect`
reported zero of them while the ESLint config the same blueprint emits reported
all five.

- **Folders are judged at the depth the blueprint declares them.** A declared
  module's own folder is never `undeclared-folder`; an undeclared one names the
  module axis and points at `architecture.modules`. A declared *layer's* folder
  sitting at the source root is its own sentence, because "declare it" — the flat
  message's next step — is advice the config cannot take: `validateModuleName`
  rejects a module that shares a layer's name, so the remedy is to move the code
  one level in. One level inside a layered module, a folder that is not a declared
  layer gets the flat message it always had, now keyed `App/utils`.
- **`missing-module`**, info tier, in `missing-layer`'s own runway wording — the
  rules arm when code lands. A module with no folder at all reports once and stops
  there: its layers would be the same absence counted `layers.length` times. A
  module that *does* have a folder is asked about its layers, as `App/hooks`.
- **`no-entry` at the module depth.** A module's entry is the one point another
  module may reach it at, so a module without one is unreachable for the same
  reason a feature folder without one is — the same sentence, one depth up, and
  the filename it looks for is that module's own `entry` override.
- **`declaratory-self-only` is asked per net rather than per layer**, because that
  is where the `no-restricted-syntax` entry is emitted: modular, one declaration is
  armed in a module that has the layer and blank in a module that does not, and a
  single verdict over the whole repo was wrong for one of them. It now addresses
  `src/<module>/<layer>` — the bare layer name pointed at the source-root folder
  `undeclared-folder` tells a modular repo to move out of.
- **`owns` declared on a module is visible to `inspect` at last** — both as
  `owns-not-installed` (named `Module "X" owns …`) and as the ownership cascade a
  package import is judged by: a file may reach a primitive its layer owns *or* its
  module owns, the same either/or `barredIn` gives the emitted config. A barred
  import names the net it was made from (`App/components`, or `common`), not a bare
  layer name that does not locate it.
- **Cross-module and intra-module verdicts come from the primitives `emitLint`
  already compiles from** — `getForbiddenModules`, `getModuleSelfOnlyTargets`,
  `getModuleEntry`, `netLabel`, and `modularVerdict` (the same function the embedded
  `blueprint/relative-escape` rule switches to, reported in that rule's own words).
  Measured end-to-end on a modular fixture wired to a real `eslint.config.mjs`
  spreading `emitLint(blueprint)`: five violations, five ESLint errors, the same
  five files, the same five reasons — and zero against zero on the legal tree.
- A folder no net covers (`App/utils/**`, a top-level folder no module declares)
  gets no import verdict at all, on purpose: the emitted config writes no entry for
  it, so a finding there would be a story ESLint never tells. The folder itself is
  still reported.

Omitting `modules` leaves every one of these exactly as it was — measured by
running both builds over the same flat fixtures and diffing the whole report,
migration steps and coverage footer included.

**`inspect` judges package ownership per RESTRICTION now, through the rules
`emitLint` compiles, so the two stop telling an adopter different stories about
one import.** The previous reading re-derived ownership from raw `owns` and
aggregated it: every owner of anything matching the specifier went into one list,
and the whole import passed when the file's own net was in that list. Measured on
a flat repo with no modules at all — `components` owning react's `createContext`,
`hooks` owning `useState`, one file importing both — `inspect` reported no
violations while the ESLint config the same blueprint emits reported `'useState'
import from 'react' is restricted`. This predates `architecture.modules`; it is
fixed here because this is the pass that claims the two engines cannot disagree.

- **One finding per restriction, naming only what that restriction covers.**
  `derivePackageRules` compiles the list and `barredIn` answers which of them a
  net is barred from — the same two functions `emitLint` calls — so a package two
  owners split by name produces one finding per owner, each carrying its own names
  in its own subject. That is also what ESLint does: measured, one import of
  `{ provide, inject }` under two overlapping vue restrictions reports three
  messages. A name the importing layer really does own now stays out of both the
  sentence and the baseline subject, so baselining the debt cannot baseline the
  legal import beside it.
- **`pattern` and `exempt` are honored at all for the first time.** A
  `pattern: true` ownership compiles to a `no-restricted-imports` group, which is
  gitignore-shaped — owning `@scope/*` reaches `@scope/foo` and `@scope/foo/bar`
  alike — while the exact-string comparison it was judged by meant a glob matched
  nothing and `inspect` was silent about every import ESLint flagged. `exempt`
  went the other way: the emitted config lets those files through and `inspect`
  reported them anyway. The exemption is read as `emitLint` writes it — scoped to
  the NET, since a net with any exempt glob emits two entries and an exempt file
  only ever reaches the one carrying the restrictions that declared no `exempt`.

**Every address a finding carries normalizes `sourceRoot`, so the path `inspect`
prints is a path that exists.** `71414f4` and `e01274b` already routed this field
through `dirSegments` on the emitter side; three readers on the runtime side still
concatenated it. Measured through the CLI, a `sourceRoot` of `'./'` addressed a
declared-but-absent module as `.//Ghost` and `'./lib/app/'` as `./lib/app//Ghost`,
while the globs governing those same files were correct — so the report sent an
agent to a folder that is not there.

- The finding address (`structure.ts`) and the scanned file path (`scan.ts`) come
  from one `sourcePrefix` now, so a folder and the files inside it can never be
  spelled two ways. That second one was not cosmetic either: the coverage line
  matches scanned paths against the layer globs, which do normalize, so a
  fully governed repo under `sourceRoot: './'` reported **enforcement vacuous —
  layer globs match 0 of 3 source file(s)**, and now reports the 2 of 3 the bare
  `'.'` spelling always reported.
- `doctor`'s alias remedy is a path the reader pastes into tsconfig, and it
  offered `"~app/*": ["././/*"]` for `'./'` — a target resolving nothing, inside
  the line that exists to make the alias resolve. It reads the field through
  `dirSegments` too.

**Still open:** `inspect`'s two *summary* surfaces have not been through this pass
and still speak the flat structure to a modular repo — the migration-step table
under the report ("declare them as layers", for a finding whose own text just said
a module cannot be named after a layer), and the vacuous-coverage line's next step
(`e.g. src/components/`, a folder the same run calls undeclared). Both are single
strings today and both need the resolved blueprint to answer, which is the shape of
the fix rather than a better sentence. That next step is also the one `sourceRoot`
reader still concatenating the field by hand — it offers `e.g. .//components/`
under `'./'` — so it is two fixes on one line, and both belong to whoever rewrites
it against the resolved blueprint.

**The two engines now agree about the GLOB in an `owns` entry, because `inspect`
calls the same two libraries ESLint calls.** The pass above judged package
ownership through the rules `emitLint` compiles, but it matched every glob with
this repo's own `globToRegExp` — which is neither matcher ESLint uses. Measured
against ESLint 9.39, three of its answers were wrong: `no-restricted-imports`
passes `ignorecase: !caseSensitive` and defaults `caseSensitive` to false, so
owning `axios` flags an import of `AXIOS`; a group with no `/` is unanchored,
because gitignore matches such a pattern against every path segment, so owning
`foo*` flags `@scope/foo`; and `exempt` is emitted as a config entry's `ignores`,
which is minimatch and reaches no descendants at all, where the old reading added
a `/**` the file matcher never has. An owner writing
`{ package: 'foo[A-Z]*', pattern: true }` — a form ESLint's own documentation
uses — got a ban `eslint` enforced and `inspect` could not see.

- **`minimatch` and `ignore` are devDependencies, bundled into `dist`.** Not
  runtime dependencies: `rolldown.config.ts` marks only `node:*` builtins
  external, so both are inlined into `dist/index.js` and `dist/bin.js`, and
  `package.json` still declares no `dependencies` and no `peerDependencies`.
  README's "No network code, zero runtime dependencies" stays literally true, and
  it is now a gate rather than a memory: `npm run dist:verify` fails if either
  field gains an entry, and copies `dist/` to a temp directory with no
  `node_modules` above it and runs both entries there, so anything left
  unbundled is `ERR_MODULE_NOT_FOUND` before publishing rather than after.
- **Three matchers, because ESLint uses three shapes.** `groupReaches` is the
  rule's own `ignore` instance, built with the options the rule builds one with
  (`allowRelativePaths`, `ignorecase: true`) and given the whole group at once.
  `fileGlobMatches` is `@eslint/config-array`'s `doMatch` — minimatch with
  `{ dot: true, allowWindowsEscape: true }`, after the leading `./` that config
  normalization strips. `ignoresFile` is its `shouldIgnorePath` reduce over a
  whole ORDERED list, which is the one a `.some()` can never express: `exempt:
  ['src/gen/**', '!src/gen/keep.ts']` re-includes the second file, and per-entry
  testing calls it exempt while ESLint lints it. `owns-not-installed` asks
  `groupReaches` too, so "is any installed dependency reached by this pattern"
  and "is this import banned" are one code path.
- **Every construct ESLint accepts, blueprint accepts.** Character classes,
  extglobs, negation and re-inclusion, escapes, a leading `/` or `#`, a trailing
  `/`, `**` inside a segment, braces around wildcards, dotfiles and case
  differences all resolve to whatever the real library says, including the
  surprising answers — `{a,b}` is three literal characters in a `pattern` group
  because gitignore has no brace expansion, and a leading `#` is a comment in
  BOTH libraries, so such a glob matches nothing at all.
- **The exemption and the test globs are ONE ordered list, built by one
  function.** A net's restricting entry carries `[...exempt, ...testGlobs]` as a
  single `ignores`, so a `!` among the test globs re-includes a file an exempt
  glob before it excused. `inspect` read the exempt half alone and called such a
  file exempt while the emitted config linted it — the false-NEGATIVE direction,
  a real violation reported nowhere. Measured through the CLI on
  `exempt: ['src/components/legacy/**']` with
  `testFiles: ['**/*.test.{js,jsx}', '!src/components/legacy/**']`: real `eslint`
  and `blueprint impact` each reported 2, `inspect` reported 1 and never named
  `src/components/legacy/Old.test.jsx`. Both readers now take that whole list, in
  order, from `emit/lint`'s own `netIgnores`, and a test asserts the emitted
  entry's `ignores` and the list `inspect` reads are the same array — because
  "both non-empty" is satisfied by two lists that disagree about a file.
- **The other `globToRegExp` callers moved with it.** Test-file filtering,
  `layerFilesIgnore`, doctor's probe nets and the coverage nets are all `files` /
  `ignores` globs, so they now go through the same minimatch the emitted entry
  does — the test globs as the ordered list they are emitted as, on each net's
  own entry. `layerFilesIgnore` is a different shape and is not claimed to be
  read as one: it is emitted as GLOBAL ignores (an entry with no `files`), which
  ESLint decides by a parent-directory walk before it reads the list, and an
  ignored directory's descendants can no longer be re-included — measured,
  `['gen', '!gen/keep.ts']` ignores every file under `gen/` as global ignores and
  none of them as an entry's. Only its file half is read here, exactly as before
  this change, and `analyze` still does not read it at all; both are pre-existing
  and belong to a follow-up rather than to this release note. Measured over 369
  paths: the default test globs
  and every plain star / globstar / brace / dotfile override classify
  identically, and the only shapes that move are the ones the old compiler read
  wrong (a `./` prefix, a character class, an extglob, a `!` negation), each now
  answering as ESLint does. `globToRegExp` itself stays, unchanged, for its one
  remaining caller: `bootstrap/ignored.ts`, which reads real `.gitignore` lines
  and wraps its own anchoring, negation and directory handling around it.
- Every form is measured, not asserted: `filter.eslint.test.ts` asks the real
  linter for each `(glob, specifier)`, `(glob, path)` and `(list, path)` triple
  and asserts the answer as well as the agreement, so a both-wrong pair cannot
  pass. The one thing it deliberately does not model is named in the same file —
  ESLint discounts a config whose `files` are all universal patterns unless
  another config matches the file specifically, which is a fact about the config
  array rather than about a glob.

**`owns-not-installed` reads a pattern owner as a group.** `dependencies
.includes(pkg)` can never find `@scope/*` in a `package.json`, so the note fired
forever — measured on a repo with `@scope/foo` genuinely installed. A pattern
owner is satisfied when any installed dependency the group reaches is there,
through the same matcher the emitted ban uses, and the note says what is actually
absent: "which no dependency in package.json matches", resolved by "installing a
package it reaches". The exact-package wording is unchanged to the byte.

**`owns-not-installed`'s layer address is the layer name, not a folder** —
`views`, where it used to print `src/views`. Its remedy was never inside
`src/<layer>/`: it is `package.json`, or the declaration in
`blueprint.config.mjs`. On a flat repo `src/views` merely happened to also be a
real folder; under `architecture.modules` the layers live inside each module
(`src/Alpha/views`, `src/Beta/views`), so there are two real folders and still
one remedy, and printing either invites a reader to go look there and find
nothing. `cycle` is the precedent — its `path` is a graph key, content-determined
— while `missing-layer` / `no-entry` keep theirs, because their remedy really is
inside that folder. It also keeps the baseline key (`rule\0path\0subject`) still
when a module is added, renamed or reordered without the underlying fact
changing. **A MODULE owner keeps `src/Gamma`**: a module name maps 1:1 to one
real folder, so the coincidence has not broken there. The column now shows two
shapes, and flat repos see the address change.
