# Commands

Blueprint runs on Node `^18.18.0 || ^20.9.0 || >=21.1.0`. Run commands through the package without
a global install:

```bash
npx @kekkai/blueprint <command>
```

`--help` works on the root CLI and every command. `--version` prints the package version. Commands
that support `--json` keep the same facts as the human-readable report so scripts and coding Agents
can consume them without parsing prose.

## `init`

`init` adopts Blueprint, repairs generated integration, or starts a guarded topology
transformation. It chooses one of three paths from repository evidence and the explicit target:

1. **Scaffold or repair** to create the framework preset for a proven-empty application (as
   layer-first, or as an empty module-first runway), a small layer-first preset, or to refresh
   generated integration from an existing valid config.
2. **Authoring playbook** for existing source without a valid config, including module-first
   adoption of existing source.
3. **Transformation playbook** when existing valid configs establish the opposite repository
   topology.

First adoption always requires an explicit topology:

```bash
npx @kekkai/blueprint init --topology layer-first
npx @kekkai/blueprint init --topology module-first
```

Preview the complete action plan without writes, installs, or Agent launch:

```bash
npx @kekkai/blueprint init --topology layer-first --dry-run
```

### Options

- **`--topology layer-first|module-first`** — Required for first repository adoption. On a proven-empty React or Vue application, `module-first` scaffolds the preset as an empty runway; with existing source it writes the authoring playbook. On an adopted repository, the same target repairs the current topology; the opposite target starts a repository-wide transformation.
- **`--preset`** — Skip authoring and use the detected Vue, React, or Next preset. This is a layer-first adoption method and is rejected for module-first targets and repositories, and for applications that already have an authored config. A proven-empty module-first application needs no flag: `--topology module-first` alone opens the runway.
- **`--authoring`** — Force the authoring playbook even below the 10-source-file brownfield threshold, or on a proven-empty module-first application, where the playbook's verdict points back to the runway. It cannot be combined with `--preset`.
- **`--agent claude|codex`** — On authoring or transformation paths, launch that local Agent CLI after the playbook is safely written. On a preset path, launch nothing and select only the matching emitted Agent contract.
- **`--framework vue|react`** — Resolve an ambiguous framework. Vue and React are otherwise detected; Next.js uses its router-aware preset.
- **`--no-install`** — Do not run the detected package manager. The plan tells you which install remains.
- **`--dry-run`** — Print the plan and perform no mutation or Agent launch.
- **`--recover-transformation`** — Restore missing pending LF→MF evidence and recovery guidance from the retained Git authority. Preserve existing decisions and guidance; do not adopt, scaffold, or complete the transformation. Use alone or with `--dry-run`. Recovery requires the recorded origin `HEAD` and safe application/source scope. If the decision file was deleted, review and record its lost decisions again before completion. See [Generated Files](./generated-files.md).

### What it changes

A completed scaffold can create `blueprint.config.mjs`, a Blueprint-owned ESLint config or a
reference config, the configured handbook, selected Agent contracts, and missing layer folders for
a fresh layer-first preset; a module-first runway creates no module folder. It may also update alias wiring, the normal `lint` script, `.gitignore`,
and dependency manifests through the detected package manager. The exact inventory and ownership
rules are in [Generated Files](/generated-files).

Existing ESLint configuration is never overwritten. Blueprint writes
`eslint.config.blueprint.mjs` for you to merge unless it recognizes a config that it generated and
owns. Re-running `init` is designed to be idempotent.

### Important boundaries

- Source shape is evidence, never topology authority. Valid configs in one repository must resolve
  to one topology.
- An unresolved multi-application scope stops before writes. Select an application source root
  during authoring instead of letting Blueprint guess.
- Blueprint never invents domain modules. A proven-empty React or Vue application can start
  module-first from the preset's empty runway; existing source requires an authored module map.
- Transformations require a Git repository, a clean worktree, and a recoverable committed `HEAD`.
  The playbook records measured moves, but the Agent decides domain names, placement, collisions,
  and import rewrites and performs them with `git mv`.
- Next.js App Router is preserved. Unsupported Pages Router or ambiguous router transformations
  stop instead of silently changing routing architecture.
- Nuxt is unsupported because its auto-import behavior prevents the static analysis Blueprint would
  need to claim a trustworthy result.

A refused or failed operation exits non-zero. If an explicitly requested Agent launch fails, the
playbook and prior artifacts are already on disk so the manual path remains recoverable.

### When adoption counts as complete

Blueprint records what it provably wrote separately from whether the adoption finished. If `init`
fails part-way, the files that landed keep their ownership records, but no completed lifecycle
checkpoint is established.

These runs do not complete adoption either:

- `--no-install` skipped Blueprint or tooling dependencies the adoption still needs;
- a brownfield run only wrote `blueprint-authoring.md` and the Agent handoff, and no final
  `blueprint.config.mjs` has been produced and adopted yet.

Finish the missing work, then run `init` again. Blueprint keeps the ownership facts it already
recorded and establishes the lifecycle checkpoint on the run that completes adoption.

In brownfield authoring, the `init` run that adopts the config the Agent wrote completes adoption
and establishes the checkpoint. `blueprint-authoring.md` may remain until the Agent's final cleanup;
while such an unfinished workflow file exists, `upgrade` still refuses to start.

### Greenfield and brownfield posture

First adoption treats an empty application differently from an existing one. The measured source
decides, not a flag.

- **Greenfield (proven-empty)** — the survey counts 0 source files in a React or Vue application.
  `init` scaffolds the framework preset's complete canonical governance: layer responsibilities,
  framework ownership, naming, principles, component-shape axes, playbook, and rule tiers.
  - `--topology layer-first` writes `reactPreset()` or `vuePreset()`.
  - `--topology module-first` writes the same preset with `modules: []`. The runway declares the
    topology and applies the same governance, but creates no module folder and invents no domain
    module — no `shared`, `core`, `app`, or anything else. A module root takes the container
    position, the repeated inner layers keep their framework responsibilities, and route
    composition belongs to the reserved `app` module once routes exist.
  - A Next.js application is not part of the module-first runway: `--topology module-first`
    enters the authoring playbook even when it is empty.
- **Brownfield (existing source)** — `init` writes the authoring playbook. The Agent translates the
  repository's own intent and thresholds, measures impact, and records understood pre-existing
  debt in its native ledgers: the Blueprint baseline for architecture findings and ESLint
  suppressions for lint hits. It does not switch on optional gates the repository never held.

Layer-first also scaffolds the preset below the 10-source-file brownfield threshold. A brownfield
config is truthful, safe adoption: a floor, not Blueprint's recommended ceiling.

### Growing a module-first runway

Generated handbooks and Agent contracts for a module-first config carry a **module growth
protocol**. When owner-requested product work needs a boundary no declared module owns, the Agent
first reasons through a temporary layer-first projection: route/page composition, then the
container/use-case responsibilities it composes, then the units each responsibility needs. It
treats those responsibilities as module seeds, merges related seeds, splits only independent ones,
and keeps domain-owned code with its owner. Only then does it materialize `Module → Layer → Unit`
and derive `dependsOn` from the real imports. It never creates one module per screen, hook/composable,
service, entity, or request noun, and never a catch-all `shared` module.

The projection is analysis only. It never describes the repository as layer-first, never writes a
layer-first config, and never starts a topology transformation.

### Tightening a brownfield config

Raising a brownfield config toward the canonical preset is the owner's decision, made after
adoption. Measure before changing anything, restore stronger contracts one step at a time, and
record only debt that existed before each step. Never lower the target to reach green.

When you decide to tighten, give this prompt to your coding Agent:

```text
Tighten this repository's Blueprint governance toward the canonical <React|Vue> preset.

1. Compare blueprint.config.mjs with the canonical preset. Print the preset with
   `node --input-type=module -e "import { reactPreset } from '@kekkai/blueprint'; console.log(JSON.stringify(reactPreset(), null, 2))"`
   (use `vuePreset` for Vue, and pass `{ modules: [] }` when the config is module-first). Run
   `npx blueprint rules --json` for the gates the config declares. List every difference in
   layers, ownership, naming, principles, and rule tiers.
2. Measure before changing anything: run `npx blueprint inspect --json` and
   `npx blueprint impact --json`, and keep both outputs as the starting evidence.
3. Restore one stronger contract at a time: a layer responsibility, an ownership rule, or a rule
   tier. After each step, run `npx blueprint init`, `npx blueprint impact --json`, and
   `npx blueprint inspect --json`, and classify every new result as pre-existing debt the step
   exposed or a regression.
4. Fix regressions. Only then record the understood pre-existing debt, each kind in its own
   ledger: architecture findings with `npx blueprint inspect --update-baseline`, lint hits with
   `npx eslint . --suppress-all` (ESLint's suppressions file; skip it only when the project's own
   lint command already passes, because `impact` counts only files inside the declared architecture
   globs, not test files or other gate files outside them).
5. Never lower a target rule, threshold, or boundary merely to reach green. If a step costs more
   than it is worth, stop and report its measured impact to the owner instead of weakening it.
6. Finish with `npx blueprint inspect --baseline`, `npx blueprint doctor`, and the project's own
   lint, typecheck, test, and build commands. Report every restored contract, the debt recorded
   for each step, and every decision left for the owner.
```

## `survey`

`survey` gathers deterministic evidence before a config exists. It reports source folders and
their shapes, repeated child-folder patterns, the folder import matrix, same-folder alias imports,
test-convention hits, source-root wiring files, and package-usage concentration.

```bash
npx @kekkai/blueprint survey
npx @kekkai/blueprint survey --source-root apps/web/src --json
```

- **`--alias <name>`** — Supply the import alias when TypeScript/JavaScript config does not reveal one.
- **`--source-root <path>`** — Select one application source root in a multi-application workspace.
- **`--json`** — Emit machine-readable evidence.

The command is read-only and reports facts without choosing layers, modules, ownership, or flow.
Those remain authoring decisions.

## `inspect`

`inspect` compares the configured source tree with the architecture. It reports undeclared
folders, module or layer flow violations, non-canonical aliases, deep imports, relative escapes,
package ownership, `selfOnly` re-exports, unit cycles, missing entries, and informative missing
module/layer positions.

```bash
npx @kekkai/blueprint inspect
npx @kekkai/blueprint inspect --update-baseline
npx @kekkai/blueprint inspect --baseline --json
```

- **`--framework vue|react`** — Resolve an ambiguous framework.
- **`--json`** — Emit the report as structured data.
- **`--update-baseline`** — Record current error/warn findings in `.blueprint-baseline.json`; info findings are excluded and zero debt writes no file. A degraded or failed import analysis refuses the update and exits `1` so an incomplete graph cannot become the baseline.
- **`--baseline`** — Fail only for findings not present in the baseline, creating a brownfield ratchet.

Any unbaselined error-level finding exits `1`; warn and info findings do not. A parse failure also
exits `1`: one failed file makes import analysis degraded, and a scan in which every file fails to
parse makes it failed. The report keeps that parser status separate from how many source files the
architecture nets reach and how many optional gates are active, so structural coverage is never
presented as proof that the dependency graph was complete.

`architecture.testFiles` defines the only structural test exemption. Static imports and re-exports
join the dependency graph; dynamic imports join only when their target can be reduced to a proven
string. Unresolved dynamic targets are disclosed without failing the command; parse failures fail
closed because they can hide dependency edges.

`inspect` does not accept a positional path. Run it from the application root; the configured
`architecture.sourceRoot` determines its scan scope. An extra path is rejected rather than ignored.

## `impact`

`impact` previews only the lint findings that Blueprint's emitted rules would introduce before
those rules are wired into the project's full config. It uses the project's own ESLint and reports
counts per rule plus the heaviest files.

```bash
npx @kekkai/blueprint impact
npx @kekkai/blueprint impact --json
```

The only option is `--json`. An authored `blueprint.config.mjs`, ESLint 9 or 10, and the relevant
project parsers/plugins are required. `init` installs the supported dependencies. On ESLint 8,
`impact` returns an explicit unavailable result and points to the ESLint 9/10 migration; it does not
expose the flat-config API error or report an unmeasured zero-hit result.

This command is informational: lint hits do not make it exit non-zero. Parse errors, unused disable
directives, and non-Blueprint rules are separated from the Blueprint total because they need to be
checked against the project's normal lint run. Vue JSX/TSX script blocks are supported. If any file
cannot be parsed, JSON reports `status: "partial"` and the text report marks the count as a lower
bound, not a complete total. Fix the source or parser configuration and rerun Impact before
judging rule tiers or recording suppressions.

## `deps`

`deps` reads the same governed import graph as `inspect`. With a unit, it prints imports and reverse
dependencies; without one, it prints a fan-in leaderboard.

```bash
npx @kekkai/blueprint deps hooks/useCart
npx @kekkai/blueprint deps src/orders/components/OrderRow.tsx --json
npx @kekkai/blueprint deps
```

- **`--framework vue|react`** — Resolve an ambiguous framework.
- **`--json`** — Emit graph results as structured data.

Only governed units participate. Skipped folders and import-analysis limits are reported. Folder
layout resolves per unit; file layout collapses to layer granularity. Imports from configured test
files do not add blast radius, and only alias and relative imports create graph edges.

## `rules`

`rules` explains what `emitLint` can enforce. It separates structural rules that always emit,
optional gates activated by `blueprint.rules`, and documentation-only rule identifiers. With a
config it also shows the declared tier/value, whether each gate is active for the current stack,
and the effective structural bans.

```bash
npx @kekkai/blueprint rules
npx @kekkai/blueprint rules --json
```

The only option is `--json`. The command is read-only and config-optional. Use it instead of
reverse-engineering the generated flat config; the configuration catalog is in
[Configuration](/configuration#rules).

## `doctor`

If ESLint returns no config for a merge-survival probe, Doctor reports that position as
unverified and names the probe path. Check global ignores and file matching; this is not proof
of overwritten rules. Real rule losses at other probes still fail. Suppressions ledgers in both
the application and effective ESLint config directories are checked.

`doctor` checks whether adoption is complete. It verifies config presence, stale temporary or
Agent files, ESLint wiring, the reachable `package.json` lint entrypoint and its live ESLint leg,
alias wiring, survival of emitted structural rules in the merged flat config, architecture status,
and the suppressions ledger.

Alias evidence is reported separately for recognized TypeScript, bundler/runtime, package `imports`
subpaths, and test-runner consumers. Evidence from one consumer never produces a whole-toolchain
green: a missing mapping fails its own check, an applicable consumer that cannot be read is
unverified, and a consumer that is absent or not applicable is labelled as such.

```bash
npx @kekkai/blueprint doctor
npx @kekkai/blueprint doctor --json
```

The only option is `--json`. Results have three meanings:

- **Complete** — every check passed; exit `0`.
- **Incomplete** — at least one check failed; exit `1`.
- **Unverified** — no check failed, but at least one had to skip; exit remains `0`.

Because a skipped check is not visible in the exit code, automation that requires proof must inspect
the JSON checks/verdict and reject `skipped` results. Unsafe or ambiguous lint command lines are
skipped rather than executed through a shell.

Doctor recognises `lint`, or `eslint` when `lint` is absent, as the normal lint script. If neither
entrypoint can be identified, that check is unverified rather than a proven wiring failure.
For executable JavaScript alias configurations, an unrecognised expression or imported alias map
is also unverified. Missing aliases are reported only where the static evidence establishes the
missing or mismatched mapping; passing a build does not independently verify every alias.

## `upgrade`

`upgrade` moves an adopted repository to a newer Blueprint release. Run it through the release
you want; the running package is the only target authority:

```bash
npx @kekkai/blueprint@latest upgrade --dry-run
npx @kekkai/blueprint@latest upgrade
npx @kekkai/blueprint@4.1.0 upgrade
```

There is no `--to` flag, and `upgrade` never downgrades — neither the recorded lifecycle nor the
installed package. It reports the lifecycle as current only when the recorded checkpoint and every
application's installed package are both at the running release; when the record matches but an
application resolves an older package or none at all, `upgrade` repairs the install instead.
`init` repairs generated integration and `doctor` verifies it.

### Why `npm update` is not an upgrade

Updating the dependency alone skips the parts of a Blueprint release that live in your repository:
config migrations, regenerated outputs, semantic work that needs a person or coding Agent, and the
final verification. `upgrade` owns the whole sequence:

1. **Plan.** Read the lifecycle checkpoint in `.blueprint-lifecycle.json`. A repository adopted
   before lifecycle state existed gets its checkpoint from provable facts only: the installed
   `@kekkai/blueprint` version, or 3.2.0 when a Blueprint 3.2 config shape proves the adoption
   predates 4.0. Then resolve every structured upgrade operation of every release in
   `(source, target]` before anything runs.
2. **Record the pending upgrade** in the lifecycle state, so an interrupted run can resume.
3. **Move `@kekkai/blueprint`** to the running target through the detected npm, pnpm, or Yarn
   manifest and lockfile, then continue with that installed copy so configs load the new release.
4. **Run deterministic migrations in code** by reconciling every adopted application through
   `blueprint init`, including the supported 3.2 → 4.0 config migration.
5. **Hand semantic work to the coding Agent** as one resolved `blueprint-upgrade.md`, when any
   remains. Complete each operation, then record it with
   `npx blueprint upgrade --complete <operation-id>`. Blueprint verifies what it can measure
   before accepting it.
6. **Verify and record.** Re-run `npx blueprint upgrade`. It reconciles again, runs
   `blueprint inspect --baseline` and `blueprint doctor` in every adopted application, and moves
   the lifecycle checkpoint only when all of them pass. Run the project's own lint, typecheck,
   test, and build as well.

### An install that stops part-way

Before it moves any package, `upgrade` records the pending upgrade. When a repository declares
`@kekkai/blueprint` in several manifests and only some applications reach the target before the
install stops, the next `upgrade` resumes the recorded upgrade:

- applications already on the target are not installed again;
- applications still on the upgrade's source continue to the target;
- any version that is neither the source nor the target of the recorded upgrade stops the run,
  because Blueprint does not guess how to repair that state.

A partial package move that Blueprint itself caused is a resumable intermediate state, not a mixed
install you have to repair by hand.

### Cumulative operations across releases

A release may add zero or more upgrade operations. Each has a stable id, the release that
introduced it, repository facts that decide whether it applies, a verification, and optional
relations to earlier operations:

- **Requires** orders an operation after another one.
- **Cancels** removes an older operation that has not run in this repository from a direct jump.
  Cancellation is not rollback: an operation that already ran stays recorded, and any cleanup of
  its effects is a separate operation.
- **Supersedes** replaces an older operation. The superseding operation owns the final state and
  converges a repository that already ran the older operation as well as one that never did.

A direct jump such as 3.2 → 4.1 and a sequence of smaller upgrades therefore reach the same
supported target. The Agent never receives raw release notes or CHANGELOG entries, only the
resolved plan.

### Options

- **`--dry-run`** — Print the source version and why Blueprint trusts it, the target, the adopted
  applications and their installed versions, the install command, deterministic migrations, the
  resolved semantic plan including removed and inapplicable operations, and the safety
  requirement. Changes nothing.
- **`--complete <operation-id>`** — Record one pending semantic operation after its verification
  passes. Cannot be combined with `--dry-run`.

### Boundaries

- Supported sources start at 3.2.0. An older adoption must first reach 3.2.0 with that release's
  own tooling.
- The running release owns only its declared window, from `supportedFrom` to itself. An operation
  that completed and later left that window keeps only the record needed to recognize it as
  history: it never re-enters a pending upgrade, and its instruction, applicability, and
  verification need not ship forever. A completed checkpoint closes the executable obligations
  before it, so the resolver only handles the supported interval from that checkpoint to the
  target.
- Starting an upgrade requires a Git worktree with no uncommitted changes, so the whole upgrade can
  be reviewed and reverted. A pending upgrade resumes regardless.
- The lifecycle is repository-wide. Every adopted application must share one installed Blueprint
  version, and the upgrade completes only when every adopted application verifies. The one
  exception is an install the recorded upgrade interrupted, which leaves each application on its
  source or its target; any other mix is refused.
- An unfinished authoring playbook or topology transformation must finish first.
- If `.blueprint-lifecycle.json` is unreadable, records upgrade history the running release could
  not have produced, or is missing where any adopted application's installed release always records
  it, every command that needs it stops. Restore it from version control; Blueprint never rebuilds
  lifecycle history from the installed package, and no command re-establishes it.
- Records without a completed lifecycle — written by an adoption that failed part-way, deferred a
  required install with `--no-install`, or is still in its authoring handoff — are not a
  checkpoint. Finish the adoption with `npx blueprint init` first.
- If the lifecycle state changes under a running upgrade, finalization stops and the checkpoint
  stays where it was.

## `remove`

`remove` de-adopts Blueprint. Run it before uninstalling the package:

```bash
npx blueprint remove --dry-run
npx blueprint remove
```

It plans the complete cleanup first and classifies every action by the evidence that Blueprint
owns it:

- **Blueprint files** — `blueprint.config.mjs`, `.blueprint-lifecycle.json`,
  `.blueprint-baseline.json`, config backups, unfinished authoring, transformation, and upgrade
  artifacts, and `*.blueprint.*` merge references are deleted.
- **Generated outputs** — the handbook, Blueprint-owned Agent rule files, and a generated ESLint
  config are deleted while they still carry Blueprint's generated marker. Once someone removed
  that marker, the file belongs to the project.
- **Managed sections** — shared Agent documents such as `CLAUDE.md` and `AGENTS.md` lose only the
  text between `<!-- BLUEPRINT:START -->` and `<!-- BLUEPRINT:END -->`, including documents the
  current config no longer names but the lifecycle still records. A file left empty is deleted only
  when the lifecycle records say Blueprint created it: owning the section does not prove Blueprint
  owns the whole file. Any other document is kept, even at zero bytes, and a document the removal
  emptied is listed for you to review.
- **Shared-file edits** — `.gitignore` exceptions, package scripts, TypeScript or JavaScript
  `paths`, and Vite aliases are reversed only when the lifecycle records the exact edit and the
  current file still contains it. Alias wiring that application source still imports is kept.
- **Folders** — layer folders Blueprint created are removed only while they hold nothing but
  `.gitkeep`, and folders left empty by the removal are cleaned up.
- **Dependencies** — `@kekkai/blueprint` is uninstalled last through the detected package manager.
  ESLint packages that Blueprint recorded installing are uninstalled too unless remaining project
  files still use them.

### Conflicts stop before any change

`remove` refuses the whole removal, and changes nothing, when:

- a recorded shared-file edit diverged, now appears more than once, or records text Blueprint
  removed, which the record alone cannot put back;
- managed-section markers are broken;
- a file that stays, such as a hand-written ESLint config or a package script, still imports
  `@kekkai/blueprint`, runs the Blueprint CLI, or loads a `blueprint.config.mjs` being deleted.

Each conflict names the file and the fix. Resolve them and re-run `--dry-run`.

### Scope and older adoptions

Run from the repository root to remove every adopted application. Run from one application in a
multi-application repository to de-adopt only that application: the lifecycle state keeps its
siblings, and a package declared where siblings still resolve it is not uninstalled. While an
upgrade is pending, removing part of the repository is refused, because the recorded plan would
keep naming an application that no longer exists; finish the upgrade, or remove the whole adoption,
which retires the pending plan and its playbook.

A file Blueprint created and later edited is composed across time: the later edits are reversed
first, and the file is deleted when it returns to the content Blueprint created and nothing in the
project still needs it.

Repositories adopted before lifecycle records existed have no proof of shared-file edits. `remove`
deletes only name- or content-proven Blueprint artifacts and reports what it could not prove, such
as alias wiring, an ESLint leg in the lint script, layer folders holding only `.gitkeep`, ESLint
packages, or a shared Agent document that held nothing but Blueprint's section, for you to review.
When a lifecycle checkpoint was established only after adoption, edits made before it are handled
the same way.

The result is a repository with no proven Blueprint config, lifecycle, generated, managed, or
dependency footprint. `remove` does not rewrite application source to make it byte-identical to
the day before adoption.
