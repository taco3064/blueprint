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

1. **Scaffold or repair** to create a proven-empty React/Vue project from canonical governance,
   including an empty module-first runway, or refresh generated integration from an existing valid
   config.
2. **Authoring playbook** for an existing project without a valid config, including brownfield
   module-first adoption where domain boundaries must be derived from repository semantics.
3. **Transformation playbook** when existing valid configs establish the opposite repository
   topology.

First adoption always requires an explicit topology:

```bash
npx @kekkai/blueprint init --topology layer-first
npx @kekkai/blueprint init --topology module-first
```

A proven-empty React/Vue project selected as module-first reuses the same canonical framework
baseline as layer-first, but writes `architecture.modules: []`. That array is an explicit
module-first runway with zero instantiated domains. Blueprint does not create fake domain folders;
future modules are materialized only after semantic container/use-case boundaries are understood.

Preview the complete action plan without writes, installs, or Agent launch:

```bash
npx @kekkai/blueprint init --topology layer-first --dry-run
```

### Options

- **`--topology layer-first|module-first`** — Required for first repository adoption. On a proven-empty React/Vue project, `module-first` scaffolds the canonical governance baseline with `modules: []`. On an adopted repository, the same target repairs the current topology; the opposite target starts a repository-wide transformation.
- **`--preset`** — Skip authoring and use the detected Vue, React, or Next preset. This flag remains a layer-first adoption method. Do not combine it with `--topology module-first`; a proven-empty React/Vue MF project already projects the canonical framework governance automatically, while brownfield MF still requires semantic authoring.
- **`--authoring`** — Force the authoring playbook even below the 10-source-file brownfield threshold. It cannot be combined with `--preset`.
- **`--agent claude|codex`** — On authoring or transformation paths, launch that local Agent CLI after the playbook is safely written. On a scaffold path, launch nothing and select only the matching emitted Agent contract.
- **`--framework vue|react`** — Resolve an ambiguous framework. Vue and React are otherwise detected; Next.js uses its router-aware preset.
- **`--no-install`** — Do not run the detected package manager. The plan tells you which install remains.
- **`--dry-run`** — Print the plan and perform no mutation or Agent launch.
- **`--recover-transformation`** — Restore missing pending LF→MF evidence and recovery guidance from the retained Git authority. Preserve existing decisions and guidance; do not adopt, scaffold, or complete the transformation. Use alone or with `--dry-run`. Recovery requires the recorded origin `HEAD` and safe application/source scope. If the decision file was deleted, review and record its lost decisions again before completion. See [Generated Files](./generated-files.md).

### What it changes

A completed scaffold can create `blueprint.config.mjs`, a Blueprint-owned ESLint config or a
reference config, the configured handbook, selected Agent contracts, and missing layer folders for
a fresh layer-first preset. A fresh module-first runway writes governance and generated artifacts
without inventing domain or repeated inner-layer folders. Init may also update alias wiring, the
normal `lint` script, `.gitignore`, and dependency manifests through the detected package manager.
The exact inventory and ownership rules are in [Generated Files](/generated-files).

Existing ESLint configuration is never overwritten. Blueprint writes
`eslint.config.blueprint.mjs` for you to merge unless it recognizes a config that it generated and
owns. Re-running `init` is designed to be idempotent.

### Greenfield versus brownfield

**Proven-empty greenfield** means the selected application has no source files from which existing
architecture debt or domain boundaries need to be preserved. React/Vue initialization may therefore
start from the complete applicable canonical governance baseline. In module-first, the topology is
selected immediately with `architecture.modules: []`, while domain modules stay intentionally
uninstantiated.

**Brownfield** means there is existing source behavior to preserve. Blueprint treats the current
repository as evidence, not permission to weaken the destination. Measure before changing anything,
understand each existing violation, grandfather only the pre-existing debt you intend to carry, and
then ratchet toward the canonical React/Vue governance baseline. Do not lower a target tier or remove
a target rule merely to make the first adoption green.

A useful Agent handoff is intentionally copyable as-is:

```text
Review this project's Blueprint configuration against the canonical React/Vue governance baseline and help tighten it progressively. Measure impact first, preserve current behavior, grandfather only pre-existing debt, and do not weaken the target rules merely to reach green.
```

The tightening loop is:

1. Run `blueprint rules`, `blueprint impact`, and `blueprint inspect` to measure the current gap.
2. Explain which findings are existing debt and which are caused by the proposed governance change.
3. Apply one justified tightening step while preserving runtime behavior.
4. If existing debt must remain temporarily, record only that understood debt with
   `blueprint inspect --update-baseline`; never baseline parser degradation or unknown evidence.
5. Run the project's normal lint/tests plus `blueprint inspect --baseline` and `blueprint doctor`.
6. Repeat by removing debt or raising governance toward the canonical baseline. Never relax the
   target merely to obtain green output.

### Important boundaries

- Source shape is evidence, never topology authority. Valid configs in one repository must resolve
  to one topology.
- An unresolved multi-application scope stops before writes. Select an application source root
  during authoring instead of letting Blueprint guess.
- A proven-empty React/Vue module-first project may scaffold canonical governance with
  `architecture.modules: []`; brownfield module-first still requires semantic authoring of actual
  domain boundaries.
- `--preset` remains layer-first-only. Do not add a separate module-first preset family or invent
  placeholder domains to make module-first scaffoldable.
- Transformations require a Git repository, a clean worktree, and a recoverable committed `HEAD`.
  The playbook records measured moves, but the Agent decides domain names, placement, collisions,
  and import rewrites and performs them with `git mv`.
- Next.js App Router is preserved. Unsupported Pages Router or ambiguous router transformations
  stop instead of silently changing routing architecture.
- Nuxt is unsupported because its auto-import behavior prevents the static analysis Blueprint would
  need to claim a trustworthy result.

A refused or failed operation exits non-zero. If an explicitly requested Agent launch fails, the
playbook and prior artifacts are already on disk so the manual path remains recoverable.

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
