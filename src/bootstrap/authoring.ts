import { DOC_ONLY_RULES, METRIC_GATES, PLUGIN_GATES } from '../emit/lint';
import type { PackageManager } from '../project';
import { renderSurvey } from '../survey';
import type { SurveyResult } from '../survey';
import { installCommand } from './plan';
import type { Action } from './types';

/**
 * The brownfield authoring flow: when `init` runs on a repo with real code
 * and no blueprint.config, scaffolding a preset would be a lie — the layers
 * already exist, someone has to *read* them. This module emits the executable
 * playbook for that judgment call (for an agent or a human), plus the
 * `/blueprint-author` command file that hands it to Claude Code. Everything
 * lands on disk before any agent starts: the manual path is not a fallback,
 * it is the same path — an agent just walks it for you.
 */

export const AUTHORING_FILE = 'blueprint-authoring.md';
export const COMMAND_FILE = '.claude/commands/blueprint-author.md';

/** The entry prompt every launcher (or human) feeds the agent. */
export const AGENT_PROMPT
  = `Read ${AUTHORING_FILE} at the repository root and execute it end to end.`;

/** A repo counts as brownfield when src/ already holds this many source files. */
export const BROWNFIELD_MIN_FILES = 10;

export interface AuthoringOptions {
  packageManager: PackageManager;
  /** True when `@kekkai/blueprint` is not yet a dependency of the project. */
  needsInstall: boolean;
  /** Skip the install action when false (`--no-install`) — instruct instead. */
  install?: boolean;
  /** Next.js project — the playbook carries framework-specific guidance. */
  next?: boolean;
}

/** The `init` actions for the authoring flow. Pure — writes nothing itself. */
export function authoringActions(survey: SurveyResult, options: AuthoringOptions): Action[] {
  const command = installCommand(options.packageManager, ['@kekkai/blueprint']);

  // The playbook's config imports @kekkai/blueprint and every follow-up step
  // resolves it from the project — the authoring flow must leave it installed,
  // or the very first `npx blueprint inspect` after authoring falls over.
  const install: Action[] = !options.needsInstall
    ? []
    : options.install !== false
      ? [{ kind: 'install', command, note: 'install @kekkai/blueprint (the config imports it)' }]
      : [{ kind: 'instruct', note: `Install skipped — the config imports @kekkai/blueprint, so run it before authoring:\n    ${command}` }];

  return [
    {
      kind: 'write',
      path: AUTHORING_FILE,
      content: authoringBrief(survey, command, options.next),
      note: `${AUTHORING_FILE} (authoring playbook + survey evidence)`,
    },
    {
      kind: 'write',
      path: COMMAND_FILE,
      content: `${AGENT_PROMPT}\n`,
      note: `${COMMAND_FILE} (/blueprint-author)`,
    },
    ...install,
    {
      kind: 'instruct',
      note: [
        'This repo already has code but no blueprint.config.mjs — authoring one is a',
        '  judgment call, so init generated a playbook instead of guessing. Have an agent',
        '  execute it (it ends by re-running init and locking a baseline):',
        `    claude "${AGENT_PROMPT}"     # or: /blueprint-author inside Claude Code`,
        `    codex "${AGENT_PROMPT}"`,
        '  …or follow the playbook yourself. Prefer a preset scaffold instead? Re-run:',
        '    blueprint init --preset',
      ].join('\n'),
    },
  ];
}

/** The playbook: goal, method, acceptance gates, and the survey evidence. */
export function authoringBrief(survey: SurveyResult, install: string, next = false): string {
  const nextNote = !next
    ? ''
    : `

> **Next.js project.** The route tree (\`app/\`, or \`pages/\` on the Pages
> Router) is itself a layer — declare it at the top of the flow (a typical
> shape: \`app\` → \`components\` → \`hooks\` → \`lib\`). Never scaffold or
> declare an empty \`src/pages\` alongside the App Router: that folder name is
> a routing convention. Flat module layout fits the route tree — relative
> imports stay free inside a segment while cross-layer traffic uses the alias.`;

  // The most common repo init ever meets is a starter, and the correct
  // outcome there is the early exit — a conclusion that must not sit buried
  // mid-playbook where a hurried agent walks the full ceremony past it
  // (field batch 10). Below the threshold, the verdict leads.
  const verdict = survey.totalFiles >= BROWNFIELD_MIN_FILES
    ? ''
    : `

## Read this first — the survey already points at the exit

The survey counted ${survey.totalFiles} source file(s) — below the
brownfield threshold (${BROWNFIELD_MIN_FILES}). At this size the expected
conclusion is the early exit, and **following this verdict IS executing
the playbook fully** — early exit is completion, not abandonment. Walk the
full method below only if you find structure the file count hides:
existing intent documents (Method step 1) or meaningful layer folders.

The complete early-exit checklist — nothing else in this file applies:

1. \`npx blueprint init --preset --agent claude\` (or \`--agent codex\`) —
   scaffolds config + artifacts with YOUR contract declared: the flag
   persists into \`emit.agents\`, so one run emits one contract file.
   Running as neither tool? Plain \`--preset\`, then declare
   \`emit.agents\` in the config and re-run init.
2. \`npx blueprint impact\` (0 hits → skip \`--suppress-all\` entirely; an
   empty suppressions ledger is ceremony) and \`npx blueprint inspect
   --baseline\` — both exit 0
3. Did init write \`eslint.config.blueprint.mjs\`? It does exactly when
   the repo already has its own eslint config: merge it — spread
   \`...emitLint(blueprint, …)\` AFTER your existing entries, following
   the reference's inline notes — then DELETE the reference; doctor
   stays red until you do. No reference written (init's generated config
   IS the live one)? That gate holds trivially, and trivially true is
   true — you skipped nothing.
4. \`npx blueprint doctor\` — all checks green
5. Delete this playbook, \`${COMMAND_FILE}\`, and the now-empty
   \`.claude/commands/\` directory. Done — "preset was enough" is a
   complete, correct report.

**Why adopt on a near-empty repo at all — emptiness is the point, not a
smell.** The contract's value is highest BEFORE the first violation
exists: this is the one moment governance costs nothing to install and
nothing to retrofit. The six declared layers, the unused alias, the
vacuous-but-honest gates are all forward-looking by design — "what
correct looks like" gets pinned down now, and the net arms itself as code
lands. Do not read the emptiness back to yourself as over-engineering;
the expensive version of this repo is the one that adopts two years and
400 files later.`;

  return `# Blueprint authoring playbook${nextNote}

> Generated by \`blueprint init\`. Execute top to bottom. When you finish,
> delete this file and \`${COMMAND_FILE}\`.${verdict}

## Prerequisites

\`@kekkai/blueprint\` must be a devDependency — the config you will write
imports it, and every \`npx blueprint\` step resolves it from the project.
\`init\` already installed it unless \`--no-install\` was passed; verify, or run:

\`\`\`bash
${install}
\`\`\`

## Goal and boundary

**Know what you are installing.** Blueprint is a governance tool for
AI-driven development: its job is to keep agents — including you, and
every agent that touches this repo after you — from drifting outside the
declared architecture. The strictness is the product, not a cost to
negotiate down. When you feel the urge to soften a tier, skip a gate, or
leave yourself an escape hatch, that urge is exactly what this tool
exists to catch: install faithfully, and put disagreements in the report
for the maintainer — never into a weakened config.

Author \`blueprint.config.mjs\` for this repository so that its architecture
rules match the code's *intent*, then generate the artifacts and lock the
baseline. Deliverables:

1. \`blueprint.config.mjs\` — validated, findings explainable
2. \`npx blueprint init\` artifacts (lint config, handbook, agent contracts)
3. \`npx blueprint inspect --update-baseline\` run — it writes
   \`.blueprint-baseline.json\` only when debt exists; on a clean repo
   "No debt to lock" and no file IS the correct outcome
4. A short report: the layer table, debt counts by category, any cycles

Out of scope: fixing the debt. Existing violations are recorded in the
baseline and paid down later — do not refactor application code in this pass.

**Early exit is a legitimate verdict.** On a repo below the brownfield
threshold (${BROWNFIELD_MIN_FILES} source files) whose shape a framework
preset already fits, the correct conclusion is to run
\`npx blueprint init --preset\`, wire its outputs, delete this playbook and
the command file, and stop. Walking the full method on a starter is
ceremony, not judgment; this playbook earns its cost on repos whose layer
boundaries have grown fuzzy.

**An empty net is equally legitimate.** On a root-only app the layer rules
reach nothing — that is the true state, not a failure to fix. Never invent
a layer to make coverage non-zero (a \`*\` name, a glob contortion): root
files are wiring, and their hygiene (line counts, unused vars) belongs to
the project's own lint, not to a manufactured layer. The net starts biting
when code lands inside declared layers. The inverse also holds: a preset's
declared-but-empty layers (and an alias no import uses yet) are the
runway, not a manufactured net — declaring intent costs nothing and
\`inspect\` tracks it honestly (missing-layer info, the coverage line), so
keep them. Keeping is the DEFAULT — the preset layers are the baseline,
and slimming them is the project owner's later decision, never the
adopting agent's.

**Work the loop, not the archive.** Everything below is evidence and
reference — it is NOT a syllabus to master before touching the config.
Draft \`blueprint.config.mjs\` early from the survey and the rule catalog,
then let the tools correct you: \`inspect\` and \`impact\` are read-only and
cheap, and a wrong draft fixed in two runs beats a perfect draft after an
hour of code archaeology. In field runs, agents that drafted first finished
in a fraction of the time of agents that studied first — at the same
quality, because the acceptance gates are the same. And if you ever feel
the need to read the package's \`dist/\` bundle to answer a question, stop:
the answer belongs in this playbook — note the gap in your report instead.

## Method

1. **Look for existing intent documents first.** An architecture config or doc
   already in the repo (\`structure.config.json\`, dependency-cruiser rules,
   \`docs/architecture*\`, \`CLAUDE.md\`/\`AGENTS.md\` sections, ADRs) is intent
   evidence *senior* to the import matrix: the matrix shows what the code
   *does*, those documents say what it *should* do. They also carry what the
   matrix cannot — the position of empty (zero-file) layers, selfOnly-style
   constraints, and ownership rules. Translate them; use the matrix to verify.
   (One token trap: structure-lint's \`{folder}\` placeholder is blueprint's
   \`{layer}\` in \`layerFiles\`.)
   Documents also go stale: cross-check every translated clause against the
   survey below. Where they disagree, the document governs *intent* (layer
   order, ownership) and the code governs *shape* (module layout) — downgrade
   the stale clause and record the conflict in your report. Flow documents
   often draw a DAG; blueprint's order is linear (a layer may import *any*
   later layer). Linearize, then verify against the matrix — linear is
   transitive, so it is usually a strict relaxation, not a real change.
2. **Study the survey evidence below.** Every number is deterministic fact
   from this repo; do not re-derive it by grepping.
3. **Decide what is a layer.** Top-level folders under \`src/\` are candidates;
   root files are app wiring (never a layer). Test plumbing (\`test/\`,
   \`__tests__/\`) belongs in \`testFiles\`, not in \`layers\`. A folder that
   exists but holds no source files usually signals declared intent — check
   the documents from step 1 before dropping it.
4. **Infer the one-way flow.** Order layers so the *majority* direction of the
   import matrix points downward. Counter-edges are debt to surface, not
   intent to encode — never contort the order to make findings zero.
5. **Choose module shape per layer.** High \`index\`-coverage child folders →
   \`module: { layout: 'folder', entry: 'index' }\` on that layer; plain files
   → the flat default. Mixed repos usually need per-layer overrides.
6. **Assign ownership.** A package imported by exactly one folder (see the
   concentration list) is an \`owns\` candidate for that layer.
7. **Write the config** with \`defineBlueprint\` (schema sketch below).
8. **Validate — the loop that keeps you honest.** Run \`npx blueprint inspect\`.
   A findings explosion (roughly more findings than source files, or one
   dominant rule everywhere) means you mistranslated intent — revisit the
   order or the module shapes. Converged means: every finding is explainable
   as real, nameable debt.
9. **Finish — and finish means integrated, not parked.** Run
   \`npx blueprint init\`, then \`npx blueprint inspect --update-baseline\`,
   write the report, and delete the two authoring files. The tool never
   touches files you own, so it leaves \`*.blueprint.*\` references next to
   them — **those references are your input, not the deliverable. Adoption
   is not done while any reference file remains:**
   - **Declare your own tool** in the config — \`emit: { agents: ['claude'] }\`
     (Claude Code) or \`['agents']\` (codex & friends) — so init generates one
     contract file, not one per tool nobody uses. Declare the tool RUNNING
     this adoption — you know who you are; never guess at future tools
     (the next one is a one-line config change away). On a preset config, pass it
     straight in: \`reactPreset({ name, emit: { agents: ['claude'] } })\` —
     and \`init --agent claude\` on the preset path scaffolds the config with
     this already declared, so flag and config end up saying the same thing.
   - **Wire the lint.** If \`eslint.config.blueprint.mjs\` was written, merge
     it into the existing flat config: spread \`...emitLint(blueprint, …)\`
     (with the TS plugin on TypeScript projects), then resolve every rule
     conflict *explicitly* — house disable conventions, thresholds, rules an
     existing structure tool already enforces — and note each decision in the
     report. Before merging, run \`npx blueprint impact\`: it lints the layer
     files with only the emitted config and reports hits per rule, so every
     conflict is decided on numbers, not by reading the emitted config
     against the code. Mind flat-config semantics while merging: when two
     entries configure the same rule, the later entry *replaces* the earlier
     — nothing merges, and ordering alone cannot save a rule **both sides
     set** (\`no-restricted-imports\`, \`no-restricted-syntax\`): whichever
     comes later silently deletes the other's defense while lint stays
     green. Combine both option sets into ONE entry — blueprint's patterns
     and selectors plus your own — and \`blueprint doctor\` verifies the
     emitted structural rules survived the merge. Run the project's own lint command; new findings introduced by
     the merge are fixed or explicitly judged, never left dangling. Delete
     the reference once wired. Exception: a **legacy-format config**
     (\`.eslintrc.*\`) needs a flat-config/ESLint-9 migration that can break
     the project's own lint pipeline — do not do that unilaterally; surface
     it as a decision item in the report instead.
   - **Red is correct — ratchet it, don't mute it.** Keep severity at
     \`error\`; adoption's job is to make debt visible and lock it, not to
     quiet the screen. Lock each side in its native ledger: architecture
     findings via \`npx blueprint inspect --update-baseline\`, lint
     violations via \`npx eslint . --suppress-all\` (\`impact\` already told
     you the count — zero hits means SKIP this command; ESLint ≥ 9.24 — counts
     per file × rule, so NEW violations still fail). CI then blocks only new
     debt on both gates, and \`blueprint doctor\` verifies neither ledger has
     gone stale. The inverse is equally correct: **zero findings and zero
     lint hits is a complete outcome** — the ledgers simply stay absent
     (plain \`inspect\` and the project's own lint are the gates), and
     manufacturing debt just to demo the ratchet is mistranslation, not
     adoption. That includes \`--suppress-all\`: on a clean lint it writes
     an EMPTY \`eslint-suppressions.json\`, and an empty ledger is ceremony
     — skip the command when there are no hits, and delete the file if one
     slipped out (\`doctor\` says so too). Still on ESLint 8 / a legacy config? Transitional fallback:
     \`emit: { lint: { severity: 'warn' } }\` — but state the cost in the
     report: severity only covers the structural rules, so until the
     migration, new metric debt (maxLines…) is not gated.
   - **If a hand-written CLAUDE.md / AGENTS.md exists**, integrate the
     \`<name>.blueprint.md\` reference into the existing document following
     *its* structure — link, don't duplicate; keep project facts to one
     screen — then delete the reference.
   - **If the repo already runs an overlapping structure tool** (e.g.
     structure-lint, dependency-cruiser), say so in the report: blueprint's
     lint layer duplicates it, and consolidating onto one gate is a scope
     decision for the user — flag it, don't decide it. **Exception:** when
     the existing tool configures the *same ESLint rules* emitLint emits
     (\`no-restricted-imports\`, \`no-restricted-syntax\`), coexistence is
     mechanically impossible — the entries overwrite each other and
     doctor's survival check fails. There, consolidation stops being a
     scope decision and becomes a wiring precondition; do it, and name
     which gate won in the report. And when a tool IS retired, retire it
     whole: DELETE its config file — a stale architecture config sitting
     beside blueprint.config.mjs misleads worse than any prose pointer —
     then sweep the footprint in the same pass: grep the repo for its name
     (docs, README, code comments, agent skills and commands all go stale
     the moment the config is deleted) and update or remove every pointer
     you find. A dependency entry leaves via the package manager, not a
     text edit; source-code comments referencing the dead tool may outlive
     the sweep under this playbook's no-source-edits boundary — list them
     in the report instead of editing them.

## Semantics the linter holds you to

Facts about the emitted rules that drive authoring decisions — stated here so
you never have to reverse-engineer them from the bundle:

- **Flat layout:** the module is the whole layer, so same-layer *relative*
  imports are always legal. The alias is for crossing layers — a same-layer
  import through the alias becomes an error the moment the lint is wired.
- **Folder layout:** a module is one child folder with private internals.
  *Same-layer* sibling modules must not import each other at all — via the
  alias or \`../\` alike; the shared part wants to live in a lower layer.
  Only *lower-layer* folder modules are importable, and entry-only; \`../\`
  escapes are caught at any depth by \`blueprint/relative-escape\`.
- **Pre-wiring check:** the survey's "Same-folder imports via the alias"
  count is an upper bound on the errors the wiring will introduce, not the
  exact number — it is a textual count that includes test files (exempt in
  the emitted config) and non-static references (dynamic imports, mock
  specifiers, doc comments) the wired rules may never flag. Treat non-zero
  as "look here"; once the config exists, \`npx blueprint impact\` reports
  the real per-rule count. The fix for true hits is layout-dependent —
  flat: rewrite them as relative imports; folder: extract the shared code
  downward (a relative rewrite just trades the error for
  \`relative-escape\`). Whatever stays unresolved lands in the suppressions
  ledger.
- **\`unusedVars\`** emits with \`argsIgnorePattern: '^_'\` and nothing else:
  \`_\`-prefixed *arguments* are exempt; unused variables and catch
  parameters are not.
- **\`doctor\`'s "eslint wired" check** passes when the eslint config's text
  references \`@kekkai/blueprint\` (or the config is the generated file
  itself).
- **Test files are EXEMPT** — \`architecture.testFiles\` (default
  \`*.test.* / *.spec.*\`) sit outside the structural rules and \`inspect\`
  alike. If the tool you are replacing policed tests too, switching to
  blueprint deliberately RELAXES that enforcement — say so in the report
  instead of letting the difference pass silently.

## Rule catalog — ask this file, not the bundle

(The same catalog is queryable anytime: \`npx blueprint rules\` — annotated
with the config's declared tiers once one exists.)

**Structural rules — always emitted**, whatever the \`rules\` block says.
Their shared severity is \`emit.lint.severity\` (default \`error\`), and that
knob covers ONLY these:

- \`no-restricted-imports\` per layer — dependency flow, same-layer bans,
  package ownership at whole-package OR named-import granularity
  (\`owns: [{ package: 'vue', imports: ['inject'] }]\` bans that named
  import outside the owning layer; same-signature entries merge into one
  rule allowing every declaring layer), fixture bans. \`additionalAliases\`
  join every structural ban alongside the main alias.
- \`no-restricted-syntax\` — re-export bans for \`selfOnly\` importers,
  emitted ONLY when some layer declares one — no selfOnly, no syntax rule
  to collide with your own \`no-restricted-syntax\`
- \`no-restricted-globals\` — global ownership (e.g. \`{ global: 'fetch' }\`)
- \`blueprint/relative-escape\` — depth-aware \`../\` module escapes
  (embedded plugin; ships inside the emitted config)

**Optional gates — emitted only when declared** in \`rules\` with a tier
other than \`off\`; none of these emits by default, and every gate scopes to
the layer file globs — root wiring sits outside all of them. When merging,
collisions are decided by rule KEY, not by hit count — \`blueprint rules
--json\` names every key the emitted config sets. The metric family falls
back to these thresholds when no \`value\` is given:

${METRIC_GATES.map((gate) => `- \`${gate.id}\` → \`${gate.rule}\` (default ${gate.fallback})`).join('\n')}
${PLUGIN_GATES.map((gate) => `- \`${gate.id}\` → \`${gate.emits}\` — ${gate.note}`).join('\n')}

**Documentation-only ids — never an ESLint line:**

${DOC_ONLY_RULES.map((entry) => `- \`${entry.id}\` — ${entry.note}`).join('\n')}

## Config schema sketch

\`\`\`js
import { defineBlueprint } from '@kekkai/blueprint';

export default defineBlueprint({
  name: '<project>',
  framework: '<vue|react>',
  architecture: {
    // Preset default is '~app' ON PURPOSE: '@' is npm's scope sigil
    // (@vue/*, @types/*) — an app alias that does not look like a package
    // scope stays visually distinct. Override only to match an existing
    // team convention, not for taste.
    alias: '<alias>',
    // Extra import roots beyond the alias — they join every structural ban.
    additionalAliases: { '~shared': './src/shared' },
    layers: [
      // Order defines the one-way flow: a layer may import only layers
      // declared AFTER it. allowedImporters (optional) narrows who may
      // import a layer; selfOnly = depend on it but never re-export it.
      { name: 'pages', does: '<one-line responsibility>' },
      {
        name: 'features',
        does: '…',
        module: { layout: 'folder', entry: 'index' }, // per-layer override
      },
      // owns entries — the full shape (nothing else lives only in dist):
      //   'axios'                                    whole package
      //   { package: 'vue', imports: ['inject'] }    named imports only
      //   { package: '@scope/*', pattern: true }     glob of packages
      //   { package: 'x', exempt: ['**/*.stories.*'] }  files exempt from the ban
      //   { global: 'fetch' }                        global identifier
      { name: 'services', does: '…', owns: ['axios', { global: 'fetch' }] },
    ],
    module: { layout: 'flat', entry: 'index' }, // private: ['hooks', …] optional — parts kept behind the entry
    layerFiles: 'src/{layer}/**/*.<ext glob>',
    testFiles: ['**/*.test.*', '**/__tests__/**'],
  },
  rules: { cycles: 'error', unusedVars: 'error' },
});
\`\`\`

## Acceptance gates

- [ ] \`npx blueprint inspect\` findings are all explainable as real debt
- [ ] \`npx blueprint inspect --baseline\` exits 0 — ledger locked when debt
      exists, correctly absent when it does not
- [ ] The blueprint lint rules run inside the project's own lint command
      (merged, conflicts resolved) — or the legacy-config migration is a named
      decision item in the report
- [ ] No \`*.blueprint.*\` reference file remains in the repo
- [ ] The report names every import cycle and every upward dependency found

## If you stop midway

Nothing is lost. This playbook and the survey stay on disk; \`inspect\` is
read-only, \`init\` is idempotent, and the baseline is only written at the
final step. A human (or another agent) resumes from the same loop.

## Survey evidence

\`\`\`
${renderSurvey(survey)}
\`\`\`
`;
}
