# Generated Files

`init` prints every planned action before or as it applies it. The exact set depends on the current
project, topology, configured emit paths, selected Agent, and whether Blueprint can safely merge an
existing integration. `--dry-run` is the authoritative preview for one repository:

```bash
npx @kekkai/blueprint init --topology layer-first --dry-run
```

This page separates three kinds of effects:

1. durable Blueprint configuration and outputs;
2. temporary authoring or transformation handoffs;
3. existing project files that `init` may update.

## Durable configuration and outputs

### `blueprint.config.mjs`

**Why it exists:** it is the architecture authority after adoption.

**What it contains:** framework, source root, layer-first or module-first structure, dependency and
ownership rules, project doctrine, and output policy. See [Configuration](/configuration).

**Ownership:** the adopter owns the architecture decisions. Blueprint may scaffold a known preset,
but an authored config is never silently replaced by a preset or by folder inference.

**Lifecycle:** a preset path creates it. An authoring playbook instructs the Agent to create it.
Later `init` runs load and validate it before refreshing outputs. A Blueprint 3.2 config is first
normalized to the supported 4.0 layer-first shape as a recoverable checkpoint; an opposite-topology
request requires a later guarded transformation run from that checkpoint.

### ESLint configuration

**Why it exists:** it carries executable module/layer flow, canonical alias, unit-entry, relative
escape, package/global ownership, `selfOnly`, and optional rule gates.

**What it contains:** `emitLint(blueprint, plugins)` plus the embedded Blueprint plugin and required
third-party plugin adapters.

**Ownership and lifecycle depend on the project:**

- **No ESLint config**
  - Result: `eslint.config.mjs` is created.
  - Ownership: Blueprint-owned while its generated first-line banner remains. A later `init` may regenerate it.
- **Blueprint generated the existing config**
  - Result: That same file is refreshed.
  - Ownership: Blueprint-owned.
- **A hand-authored flat config already exists**
  - Result: `eslint.config.blueprint.mjs` is created and Blueprint prints merge instructions.
  - Ownership: Reference only; the adopter decides how to combine it with house rules, then removes the reference.
- **The existing flat config already wires `emitLint`**
  - Result: No config file is replaced.
  - Ownership: Adopter-owned.
- **Legacy `.eslintrc` exists**
  - Result: A flat reference config and migration instructions are produced.
  - Ownership: The adopter owns the migration.

For a selected application below a repository-level flat config, that ancestor remains the live
policy. `init` never writes a nested live config that would shadow it. If an earlier Blueprint run
left such a generated shadow, `init` removes that generated file and emits a repository-root-ready
reference instead; a hand-authored nested config is never removed. The reference imports the
application blueprint by its repository path and computes an absolute `applicationRoot` for
`emitLint(..., { basePath: applicationRoot })`. Its parser and anti-bypass entries use the same
native flat-config `basePath`, so both Blueprint rules and existing repository rules reach the
selected application whether ESLint is invoked from the repository or application directory.

Flat-config entries replace matching rule keys rather than merging their options. After manual
integration, use `blueprint doctor` to check that the structural restrictions survive the final
ordering.

Generated handbooks and Agent contracts distinguish a reference-only lint export from verified
project-lint integration. A config mentioning Blueprint is not proof that its rules execute.
After merging the export, rerun `init`: it checks effective rule survival and the safely replayable
project lint command before upgrading the generated enforcement statement. Without that evidence,
the documents explicitly retain an unverified or reference-only statement.

### Architecture handbook

**Default path:** `docs/architecture-handbook.md`  
**Configured by:** `emit.handbook`

**Why it exists:** it explains the architecture to people: topology, dependency diagram, layer
responsibilities, naming, principles, component axes, rules, and playbook.

**Ownership:** Blueprint owns the whole file at the resolved path and overwrites it on refresh. Edit
the config authority, not the generated handbook.

**Lifecycle:** written on every scaffold/repair path with a valid config. If `.gitignore` hides it,
`init` adds a narrow unignore entry so a generated contract cannot disappear from version control.

### Agent contracts

`emit.agents` selects targets and may override each project-relative path. Omission defaults to
Claude and AGENTS; an empty array emits none.

- **`claude`** — Default path: `CLAUDE.md`; merge-managed shared document.
- **`agents`** — Default path: `AGENTS.md`; merge-managed shared document.
- **`gemini`** — Default path: `GEMINI.md`; merge-managed shared document.
- **`copilot`** — Default path: `.github/copilot-instructions.md`; merge-managed shared document.
- **`cursor`** — Default path: `.cursor/rules/blueprint.mdc`; Blueprint-owned rule file.
- **`windsurf`** — Default path: `.windsurf/rules/blueprint.md`; Blueprint-owned rule file.

**Why they exist:** they put architecture facts and non-mechanical project rules in the coding
Agent's normal context.

**What they contain:** the resolved source layout, dependency and ownership boundaries, naming,
configured doctrine, and verification commands. Cursor and Windsurf add the frontmatter their tools
require.

**Merge-managed files:** Blueprint owns only the text between `<!-- BLUEPRINT:START -->` and
`<!-- BLUEPRINT:END -->`. Content outside the markers remains adopter-owned. If an existing shared
file has no markers, Blueprint does not overwrite it:

- when the file already references `@kekkai/blueprint`, `init` asks the adopter to add the managed
  markers around the existing integration;
- otherwise it writes a sibling reference such as `CLAUDE.blueprint.md` or
  `AGENTS.blueprint.md` and prints explicit merge instructions.

Reference files are temporary integration aids, not a second permanent contract.

**Blueprint-owned files:** Cursor and Windsurf rule files are replaced in full on refresh. If an
output is removed from `emit.agents`, `init` may remove a wholly Blueprint-owned or wholly generated
stale file. A shared hand-edited document is not deleted; Blueprint reports the stale marked section
for the adopter to resolve.

As with the handbook, `init` adds narrow `.gitignore` exceptions when selected contract files would
otherwise be hidden.

### Fresh layer folders

A fresh **layer-first preset** may create missing layer directories under the resolved `sourceRoot`
and place `.gitkeep` inside them. This gives an empty project the selected preset shape.

Existing source trees are never padded with absent layers, and module-first never invents module
folders: its module names and ownership require authoring judgment.

## Temporary workflow artifacts

### `blueprint-authoring.md`

This root-level playbook is created for brownfield authoring, first module-first adoption, and
layer-first ↔ module-first transformation. It contains measured repository evidence, decision
boundaries, steps, refusal conditions, and acceptance gates for the human or Agent completing the
work.

Blueprint owns it only for the active workflow. It is not the architecture authority and must be
removed after the playbook reaches its final cleanup step. `doctor` treats a leftover copy as
incomplete adoption.

For repository-wide transformations, one playbook is written at the repository root and carries a
separate measured section for every adopted application. Blueprint never moves application source
automatically; the Agent follows the playbook and uses Git-aware moves.

### `blueprint-transformation.json`

Layer-first → module-first work also creates this application-local, machine-consumed obligation.
It records the recoverable Git head, application and source scope, framework/router position, and
the measured `pages`, `app`, and `containers` source members. The Agent records every reviewed
source → destination decision in `target.decisions`; replacing the config with a valid module-first
config does not erase that obligation. Before writing the playbook, Blueprint retains the immutable
origin in an application-scoped Git ref under `refs/blueprint/transformations/`. Deleting the JSON
file or changing its origin blocks ordinary init until the recorded evidence is restored. These
refs belong to this Git repository; ordinary clones do not transfer them automatically.

Each decision includes `source`, `destinations`, and `members: [{ source, destination }]`. Every
origin member must map exactly once to a globally unique destination. Blueprint compares its Git
origin content with the destination, requiring the same source extension and permitting CRLF
normalization and import/export module
specifier rewrites only. Other content edits require completing this verifiable move first;
file existence or an unrelated existing module is not transfer evidence.

The next `init --topology module-first` verifies the recorded Git inventory, reserved `app` route
composition, consumption of container seeds, destination positions, current import analysis, and
all architecture error findings without baseline suppression. A conflicting requested topology is
rejected until retirement. Only a successful verification retires this file and the transformation
playbook. `--authoring` is explicitly re-authoring and never historical transformation proof.
Hand-authored module-first projects without a pending Git transformation authority may intentionally use custom layer names
such as `pages` or `containers`; Doctor and Inspect prove their current config, not a past migration.

### `.claude/commands/blueprint-author.md`

This launcher contains the short Claude prompt that opens `blueprint-authoring.md`. It is created
only when the resolved authoring policy includes Claude. Explicit `--agent codex` authoring does not
create it; `--agent claude` does. A repository-wide transformation refuses conflicting application
policies rather than choosing one launcher behavior.

The launcher is temporary and is removed with the authoring playbook after completion. `doctor`
also treats a leftover launcher as incomplete adoption.

### Reference and migration handoffs

Files matching `*.blueprint.*`, especially `eslint.config.blueprint.mjs` and merge-reference Agent
documents, exist to support a manual integration decision. They should be removed when their
contents have been incorporated. They are not regenerated product authorities, and `doctor` reports
them while adoption remains unfinished.

## Existing project files `init` may update

### `tsconfig.json`, referenced TypeScript configs, or `jsconfig.json`

Blueprint ensures the canonical `architecture.alias` and any `additionalAliases` have
`compilerOptions.paths` mappings to their configured roots.

- A parseable existing config is patched without replacing unrelated fields.
- A TypeScript references shell is followed to the application config when that target is
  available.
- A JavaScript project with no config may receive a minimal `jsconfig.json`.
- If a TypeScript config cannot be patched safely, Blueprint prints the exact manual wiring instead
  of inventing a new TypeScript configuration.

These files remain adopter-owned. Blueprint only adds missing alias entries and leaves existing
entries intact.

### Bundler alias configuration

For a fresh Vite scaffold, Blueprint can add the canonical alias to the detected Vite config when
the edit is structurally safe. Existing wiring through a quoted alias or a `tsconfig-paths` bridge
is preserved. Otherwise `init` prints the required Vite or general bundler mapping for the adopter
to apply.

The bundler configuration is adopter-owned. A TypeScript path mapping alone does not prove runtime
module resolution, so `doctor` checks for toolchain wiring and the playbook also asks for a real
build.

### `package.json` and the package-manager lockfile

On a fresh scaffold, `init` may add a normal `lint` script or append an ESLint leg to an existing
non-ESLint lint script when the edit is unambiguous. On an authored project it prints instructions
instead of rewriting a house script it cannot safely interpret.

Unless `--no-install` is set, `init` runs the detected npm, pnpm, or Yarn command for missing
Blueprint/ESLint dependencies. That package manager owns updates to `package.json` and its lockfile;
Blueprint does not hand-edit lockfile syntax. In a workspace, detection follows the applicable
package/toolchain root rather than assuming the current directory owns the lockfile.

### `.gitignore`

If the configured handbook or selected Agent contracts are hidden by an existing ignore rule,
`init` appends a marked group of narrow `!path` exceptions. It preserves the file's existing line
ending style and does not broadly unignore its parent tree.

The adopter continues to own every other ignore rule.

### `.blueprint-baseline.json` and `eslint-suppressions.json`

`init` does not create the inspection baseline. `blueprint inspect --update-baseline` owns creation
or refresh of `.blueprint-baseline.json`, and `inspect --baseline` consumes it as accepted existing
debt.

`eslint-suppressions.json` is also not generated by `init`; `doctor` only verifies that entries do
not point at files that no longer exist.

## Verify the result

After integration or authoring completes:

```bash
npx @kekkai/blueprint inspect --baseline
npx @kekkai/blueprint doctor --json
```

Inspect the JSON result rather than the exit code alone when skipped Doctor checks must fail your
automation. Run the project's normal lint and build as separate proof that the merged ESLint and
alias configuration work in the real toolchain.
