import { DOC_ONLY_RULES, METRIC_GATES, PLUGIN_GATES } from '../emit/lint';
import { AUTHORING_FILE, COMMAND_FILE } from '../project';
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

// Defined in `project` so doctor (a lower layer) can flag leftovers;
// re-exported here because they are authoring concepts first.
export { AUTHORING_FILE, COMMAND_FILE } from '../project';

/** The entry prompt every launcher (or human) feeds the agent. */
export const AGENT_PROMPT
  = `Read ${AUTHORING_FILE} at the repository root and execute it end to end.`;

/** A repo counts as brownfield when src/ already holds this many source files. */
export const BROWNFIELD_MIN_FILES = 10;

export interface AuthoringOptions {
  packageManager: PackageManager;
  /**
   * True when `.claude/` already existed before this run.
   *
   * The cleanup step used to assert "init created the tree only to hold this
   * command" — a fact init knows and had not checked, and false on any repo whose
   * owner already uses Claude Code. A field agent went back to its own opening
   * `ls -la` to verify before running `rmdir`, and said so: the tool leaned on the
   * agent for something it could measure itself.
   *
   * Required, and with no default further down: the playbook states this as fact, so
   * no caller may leave it unstated — a default would be a value nothing reads, and
   * nothing reading it is exactly what makes a wrong one invisible.
   */
  hadClaudeDir: boolean;
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
      ? [{ kind: 'install', command, note: '@kekkai/blueprint (the config imports it)' }]
      : [{ kind: 'instruct', note: `Install skipped — the config imports @kekkai/blueprint, so run it before authoring:\n    ${command}` }];

  return [
    {
      kind: 'write',
      path: AUTHORING_FILE,
      content: authoringBrief(survey, command, options),
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
      // The primary caller is now an agent that ran this from a one-line
      // adoption prompt — the homepage no longer spells out the acceptance
      // gates (the playbook carries them), so the bridge INTO the playbook has
      // to live here. An agent reading a third-person "have an agent execute
      // it" concludes its own job is done and hands back to a human; address
      // the running agent directly, and restore the "autonomously, early exit
      // = completion" framing the prompt used to carry. "locking a baseline
      // only when debt exists": the sub-threshold early exit locks nothing —
      // 0 debt writes no baseline file, and doctor is green without one (field
      // issue #12).
      note: [
        'This repo already has code but no blueprint.config.mjs — authoring one is a',
        '  judgment call, so init generated a playbook instead of guessing.',
        '  If you are the agent that ran this, keep going — do not hand back: read',
        '  blueprint-authoring.md and execute it to the end yourself, autonomously. An',
        '  early exit the playbook prescribes IS completion; it ends by re-running init',
        '  (and locking a baseline only when debt exists).',
        '  Driving this by hand instead? Launch a fresh agent on the playbook:',
        `    claude "${AGENT_PROMPT}"     # or: /blueprint-author inside Claude Code`,
        `    codex "${AGENT_PROMPT}"`,
        '  …or follow the playbook yourself. Prefer a preset scaffold instead? Re-run:',
        '    blueprint init --preset --agent claude   # or --agent codex; plain --preset as neither',
      ].join('\n'),
    },
  ];
}

/** The playbook: goal, method, acceptance gates, and the survey evidence. */
export function authoringBrief(
  survey: SurveyResult,
  install: string,
  // An options object, not two positional booleans. `hadClaudeDir` is required and
  // `next` has a default, so positionally every caller had to state `next` in order
  // to reach the field after it — which silently retired `next`'s default and the
  // only thing exercising it. Two booleans in a row is how that happens.
  facts: { next?: boolean; hadClaudeDir: boolean },
): string {
  const { next = false, hadClaudeDir } = facts;

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
   --baseline\` — both exit 0. (\`--update-baseline\` is deliberately not
   on this list: with zero debt it is a no-op that writes nothing — the
   full method runs it because brownfield repos have debt to lock; a
   clean early exit has none.)
3. Did init write \`eslint.config.blueprint.mjs\`? It does exactly when
   the repo already has its own eslint config: merge it — spread
   \`...emitLint(blueprint, …)\` AFTER your existing entries, following
   the reference's inline notes — then DELETE the reference; doctor
   stays red until you do. No reference written (init's generated config
   IS the live one)? That gate holds trivially, and trivially true is
   true — you skipped nothing. Either way, close this step by running
   the project's own lint once (\`npm run lint\`, or \`npx eslint .\`
   without a script): doctor's wired check reads config text and never
   executes eslint, so only a real run proves the config loads. A green
   lint is not proof the gates are ATTACHED, and on a repo whose layers
   hold no files yet it proves only that the config parses — there is
   nothing for a rule to fire on. That gap is doctor's job, not yours:
   its survival check resolves every declared gate that rides an
   injected plugin and reds when one resolved to nothing, so **you do
   not need to print configs by hand on this path**. Reach for
   \`npx eslint --print-config <file>\` only for what doctor's ✓ says it
   does NOT compare — thresholds, package-ownership entries, and the
   survival of your OWN rules — and read the output knowing four
   things, or a correct config looks broken: resolved keys carry their
   plugin prefix (\`@stylistic/max-len\`, never bare \`max-len\`); a rule
   scoped to a layer that holds no files does not appear at all (that is
   inspect's \`declaratory-self-only\` note, not a loss); selfOnly's
   re-export ban resolves on the IMPORTER layer named in inspect's
   output, not on the layer being protected; and **inspect's finding
   names are not ESLint rule ids** — \`deep-import\`,
   \`flow-violation\` and \`package-ownership\` all fold into the single
   \`no-restricted-imports\` entry, so searching a resolved config for
   \`blueprint/deep-import\` finds nothing and proves nothing. Inspect's
   own migration steps name the rule that carries each finding, and mark
   the ones no lint run will ever show. Same logic for the alias: init edited \`tsconfig\`/\`vite\`, and doctor's
   alias check reads that wiring as text, never as a compile — run the
   build once too (\`npm run build\`, or \`npx tsc -b\`). The same caveat
   as the lint run applies, and for the same reason: on a repo whose layers
   hold no files, nothing imports through the alias, so a green build proves
   the \`tsconfig\`/\`vite\` edits parse and compile — NOT that the alias
   resolves. It becomes that proof the first time a layer file imports
   through it. Run it anyway (cheap, and it catches an edit that broke the
   config outright) and report which of the two you got. Its artifacts
   (\`dist/\`, \`*.tsbuildinfo\`) are the build's normal output, not
   adoption leftovers: leave them to the repo's own ignore rules, and
   when the repo has none — including a repo under no version control at
   all, where nothing is tracked and "untracked" describes everything —
   say so in the report instead of guessing a cleanup. Say it as what it is — a step THIS playbook asked for
   produced untracked files in someone's working tree — and say that
   deleting them is safe, because nothing adoption wrote depends on them
   and the build can be re-run. Then it is the owner's call rather than
   an unexplained mess: "leave them" without that sentence reads as "you
   may not touch these", which is not what it means.
4. Delete this playbook, \`${COMMAND_FILE}\`, and the now-empty
   \`.claude/commands/\` directory${
      hadClaudeDir
        ? ` — but NOT \`.claude/\` itself: it was already here before this run, so
   it is the owner's, whatever ends up left in it.`
        : ` — and \`.claude/\` itself, which init created
   only to hold this command (it was not here before this run).`
    }
   Cleanup comes BEFORE the final gate: doctor treats these authoring
   files as leftovers.
5. \`npx blueprint doctor\` — all checks green. Then commit what adoption
   wrote, if you can: a ratchet that lives only in an uncommitted working
   tree is not installed. Not a VCS repo, or no commit rights? Leave the
   files where they are and say so in your closing reply — never
   initialize version control on the owner's behalf. (The full method
   states this too; it is repeated here because this checklist is the
   whole of your instructions and a handoff you have to go looking for
   is one you can miss.) Done — "preset was enough", said in your closing
   reply to the user, is a complete, correct report; no report file
   exists on this path.

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

> Generated by \`blueprint init\`. Execute top to bottom, autonomously — do
> not stop to ask for confirmation. When you finish, delete this file and
> \`${COMMAND_FILE}\` — then \`blueprint doctor\` has the final word: it flags
> both as leftovers while they remain.${verdict}

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
4. A short report: the layer table, debt counts by category, any cycles.
   It is a message, not an artifact — deliver it as your closing reply to
   the user (or the PR description when one is opened); never commit a
   report file

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
adopting agent's. When a declared-but-empty layer ALSO looks stale, the
tiebreak is prose intent: an intent document describing it as a future
seam makes it runway (keep); one the prose never mentions, contradicted
by where the code actually lives, is a stale clause (downgrade it and
record the conflict — Method step 1).

**Work the loop, not the archive.** Everything below is evidence and
reference — it is NOT a syllabus to master before touching the config.
Draft \`blueprint.config.mjs\` early from the survey and the rule catalog,
then let \`inspect\` correct you: it is read-only, cheap, and needs nothing
installed, and a wrong draft fixed in two runs beats a perfect draft after an
hour of code archaeology. \`impact\` is the same kind of read-only feedback
but is NOT available at this point — it lints with the emitted config, so it
needs the plugins \`init\` installs; it joins the loop at Method step 9, after
init. Reaching for it while drafting only earns you a load error.
In field runs, agents that drafted first finished
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
   One document family is NOT senior evidence: blueprint's own prior output.
   A \`docs/architecture-handbook.md\` it generated, and any \`BLUEPRINT:START\`
   marker block in \`CLAUDE.md\`/\`AGENTS.md\`, are a previous answer to this
   same question — re-adopting a repo blueprint has already adopted, they will
   hand you back the old config almost verbatim. Read them as an answer to
   CHECK, never as intent to translate: derive the flow from the matrix
   independently first, then compare. Agreeing is the good outcome (that is
   idempotency); agreeing because you copied is how a mistranslation from the
   first pass becomes permanent.
   One exception, and it decides the harder cases: some clauses **cannot** be
   derived from the matrix at all — ownership of a named import, the shape of a
   selfOnly narrowing, the position of a layer holding no files, a permitted
   importer with zero edges today. For those the prior output is the only
   evidence there is, so check-only means dropping them, and a "faithful"
   re-adoption then hands back a config LOOSER than the one it replaced.
   Verify each against what the matrix CAN see (is there an edge for this
   importer? is the owned package imported only there?), reproduce it when that
   checks out, and list in your report which clauses were reproduced rather
   than derived. Regressing a gate the owner already committed is the worse
   error.
   One more thing about re-adoption, so you do not spend a cycle proving it:
   the artifacts init regenerates — the contract block, the handbook — can
   come out WORDED differently from the ones committed, when the installed
   version is newer than the one that wrote them. That is the version's
   improvement arriving, not drift and not non-idempotency; re-run init twice
   and the second run is byte-identical to the first. Take the new wording and
   say in your report that it changed. Never hand-revert generated text toward
   what git happens to hold.
   Documents also go stale: cross-check every translated clause against the
   survey below. Where they disagree, the document governs *intent* (layer
   order, ownership) and the code governs *shape* (module layout) — downgrade
   the stale clause and record the conflict in your report. Flow documents
   often draw a DAG; blueprint's order is linear (a layer may import *any*
   later layer). Linearize, then verify against the matrix — linear is
   transitive, so it is usually a strict relaxation, not a real change.
   Several positions equally legal (no matrix edges either way — empty
   layers especially)? Pick the one granting the fewest new import
   permissions: the smallest relaxation.
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
   → the flat default (omit \`module\` entirely — it validates and resolves
   to \`{ layout: 'flat', entry: 'index' }\`). Mixed repos usually need
   per-layer overrides.
6. **Assign ownership.** A package imported by exactly one folder (see the
   concentration list) is an \`owns\` candidate for that layer. A candidate
   the intent documents never mention is a proposal, not intent — leave it
   out of the config and name it in the report; encoding it is tightening
   beyond what the repo declared.
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
     — **carrying its options object over whole**: \`stylistic\` and
     \`imports\` always, plus \`typescript: tseslint.plugin\` on TypeScript
     projects. Those arguments are load-bearing, not decoration: five gates
     ride an injected plugin (\`codeStyle\`, \`statementsPerLine\` and
     \`statementPadding\` on stylistic; \`importBlock\` on imports;
     \`explicitAny\` on the TS one) and a gate whose plugin is missing emits
     NOTHING while lint still passes — a dropped argument reads exactly like
     a clean merge. **Declared no gates from those families?** Pass the
     carriers anyway, and let \`init\` install them: that is deliberate, not
     over-installation. They sit inert until a gate names them, and paying
     for them now makes turning one on a one-line edit to
     \`blueprint.config.mjs\` — instead of a config edit plus an install plus
     a second pass over this merge, months later, by someone who was not
     here. Then resolve every rule
     conflict *explicitly* — house disable conventions, thresholds, rules an
     existing structure tool already enforces — and note each decision in the
     report. **\`codeStyle\` means blueprint's emitted config formats this
     repo**, so a repo that already runs its own formatter is the
     overlapping-tool case above: keep ONE owner of formatting, and say which
     in the report. Rules configured under the same key on both sides
     (\`@stylistic/*\`, \`padding-line-between-statements\`) collide
     mechanically — flat config replaces rather than merges — so those are a
     wiring precondition, not a preference. Before merging, run \`npx blueprint impact\`: it lints the layer
     files with only the emitted config and reports hits per rule, so every
     conflict is decided on numbers, not by reading the emitted config
     against the code. Mind flat-config semantics while merging: when two
     entries configure the same rule, the later entry *replaces* the earlier
     — nothing merges, and ordering alone cannot save a rule **both sides
     set** (\`no-restricted-imports\`, \`no-restricted-syntax\`): whichever
     comes later silently deletes the other's defense while lint stays
     green. Combine both option sets into ONE entry — blueprint's patterns
     and selectors plus your own (\`npx blueprint rules --json\` carries the
     exact selfOnly selector strings per layer; copy them from there, never
     from an emitLint dump).

     **"ONE entry" means one per COLLISION, not one for the whole rule
     key.** emitLint scopes its entries per layer, so a rule key can have
     several — a \`selfOnly\` layer with two importers emits
     \`no-restricted-syntax\` on BOTH importer layers, and your own rule
     may overlap only one of them. Combine with the entry you actually
     collide with, and leave the others exactly as emitted. The two ways
     to get this wrong are the two the instruction used to walk into:
     widening your combined entry to cover the other layers as well
     imposes YOUR rule on files it never governed (new red, visible), and
     narrowing it to exclude them replaces their emitted entry with
     nothing (silent, lint still green — the very trap this paragraph
     opens with). Check the emit points before merging, not after:
     \`npx blueprint rules --json\` lists the selectors per layer, so two
     importers show up as two. If you get it wrong anyway, doctor's
     survival check probes every layer separately and names the one that
     lost its selectors — it is a red you can act on, not a silent pass.

     **How you combine, given that \`...emitLint(blueprint)\` is opaque.**
     You cannot reach inside the spread to edit the entry it emits, so do not
     try: write the combined entry yourself and place it AFTER the spread.
     That is the same later-replaces-earlier property this paragraph opens by
     warning about, used deliberately — yours becomes the effective entry for
     that rule key on the files it scopes to. Which is exactly why it has to
     carry everything the emitted one did: both option sets, the emitted
     \`ignores\`, and the SAME file scope. Wider, and you impose your rule on
     layers it never governed; narrower, and the layers you dropped are left
     with nothing, silently. Confirm with \`npx eslint --print-config\` on one
     file per affected layer — the one place print-config is not optional,
     because doctor compares selectors and cannot see scope.

     **An entry is more than its selectors — carry the emitted block's
     \`ignores\` too.** Every structural entry exempts test files, and a
     combined entry you rebuild from selector strings has no such
     exemption unless you write one. \`rules --json\` gives it to you as
     \`testExemptions\` beside the selectors, and the text output prints
     the \`ignores\` line to paste. Skip it and your combined entry starts
     governing test files: loud if your own rule collided there (a real
     run lost this and spent a debug cycle on 34 errors in one test file),
     silent if only blueprint's ban did — lint stays green while the test
     files it was never meant to reach are quietly under it. Doctor
     compares selectors, not scope, so nothing downstream catches this.
     The same move runs the other way when YOUR rule had no exemption:
     carrying blueprint's \`ignores\` onto the combined entry stops your rule
     at test files it used to govern. One entry carries one \`ignores\`, so a
     merge has to pick — decide which scope each rule actually wants, say
     which one you widened or narrowed and why, and check whether the same
     rule appears on other layers you did NOT merge, because that is where
     the asymmetry lands.

     \`blueprint doctor\` verifies both the
     emitted structural rules and each declared gate's carrier rule
     survived the merge — so a hand sweep of the emitted gates duplicates
     it. What doctor does NOT compare is thresholds, package-ownership
     entries, and the survival of the rules YOU brought to the merge, and
     its ✓ says so. That remainder is what
     \`npx eslint --print-config <file>\` is for; a green lint run does
     not substitute, since it proves the config loads, not that a given
     rule reached a given file. Four things to know before reading that
     output, or a correct config looks broken: resolved keys carry their
     plugin prefix (\`@stylistic/max-len\`, never bare \`max-len\`); a
     rule scoped to a layer that holds no files does not appear at all
     (inspect's \`declaratory-self-only\` note, not a loss);
     selfOnly's re-export ban resolves on the IMPORTER layer inspect
     names, not on the layer being protected; and **inspect's finding
     names are not ESLint rule ids** — \`deep-import\`,
     \`flow-violation\` and \`package-ownership\` all fold into the
     single \`no-restricted-imports\` entry, so searching for
     \`blueprint/deep-import\` finds nothing and proves nothing.
     Inspect's migration steps name the carrying rule for each finding,
     and mark the ones no lint run will ever show. Run the project's own lint command; new findings introduced by
     the merge are fixed or explicitly judged, never left dangling — and
     when init wired the alias into \`tsconfig\`/\`vite\`, run the build
     once too (doctor's alias check reads wiring as text, never as a
     compile). Merging into a TypeScript config file
     (\`eslint.config.ts\`)? Importing \`./blueprint.config.mjs\` trips
     TS7016 when the tsconfig covering that file lacks \`allowJs\` — add
     \`allowJs: true\` there (often \`tsconfig.node.json\`), or ship a
     one-line \`blueprint.config.d.mts\` declaring the default export as
     \`Blueprint\`; name the choice in the report. Delete
     the reference once wired. Exception: a **legacy-format config**
     (\`.eslintrc.*\`) needs a flat-config/ESLint-9 migration that can break
     the project's own lint pipeline — do not do that unilaterally; surface
     it as a decision item in the report instead.
   - **Red is correct — ratchet it, don't mute it.** Keep severity at
     \`error\`; adoption's job is to make debt visible and lock it, not to
     quiet the screen. Lock each side in its native ledger: architecture
     findings via \`npx blueprint inspect --update-baseline\`, lint
     violations via \`npx eslint . --suppress-all\` (\`impact\` already told
     you the count — zero hits means SKIP this command, with one carve-out:
     the anti-bypass guard sits OUTSIDE impact's scope, so bare disables it
     flags in YOUR lint run are real findings — judge them: annotating the
     disable with its reason is a comment edit, not a source refactor, so
     it sits INSIDE this pass's boundary; the ledger takes whatever you
     choose to leave, and the report says which you did; ESLint ≥ 9.24 — counts
     per file × rule, so NEW violations still fail). **The formatting family
     is the exception to "ledger it, don't fix it":** \`codeStyle\` and
     \`statementPadding\` are nearly all auto-fixable, so \`eslint --fix\`
     resolves them outright and suppressing them would ledger a reformat
     nobody needs to review. Run that fix as its OWN commit, touching
     nothing else, and say so in the report — it rewrites whitespace across
     every layer file *including tests* (the shape rules are the one gate
     family tests are NOT exempt from), and a diff that size folded into an
     architecture commit is unreviewable. It cannot make another gate worse:
     \`maxLines\` skips blank lines, so the added lines are free. What
     \`--fix\` does NOT resolve is worth naming, because those are the real
     findings: \`max-len\` has no fixer (a long line must actually be
     restructured — and it does not exempt plain strings, so a string cannot
     hide one), and a \`linebreak-style\` red usually means git's
     \`autocrlf\` / \`.gitattributes\`, NOT the file — fix it there or the
     next checkout undoes you.
     Your gate then blocks
     only new debt on both, and \`blueprint doctor\` verifies neither ledger
     has gone stale. The inverse is equally correct: **zero findings and zero
     lint hits is a complete outcome** — the ledgers simply stay absent
     (\`inspect --baseline\` — identical without a ledger — and the
     project's own lint are the gates), and
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
     which gate won in the report. The inverse case — a house rule under
     a DIFFERENT key with the same semantics (a hand-rolled deep-watch or
     test-filename twin) — never collides mechanically; it double-reports
     instead. Keep ONE gate per semantic (the house rule's docs footprint
     usually decides which) and record the choice — declaring blueprint's
     twin on top is noise, not safety. The same rule spans gate LAYERS:
     a house \`import/no-cycle\` (lint) and the \`cycles\` gate (inspect)
     are one semantic — pick one detector and record it (the catalog's
     perf note usually argues for the inspect side). And when a tool IS retired, retire it
     whole: DELETE its config file — a stale architecture config sitting
     beside blueprint.config.mjs misleads worse than any prose pointer —
     then sweep the footprint in the same pass: grep the repo for its name
     (docs, README, code comments, agent skills and commands all go stale
     the moment the config is deleted) and update or remove every pointer
     you find. A dependency entry leaves via the package manager, not a
     text edit; source-code comments referencing the dead tool may outlive
     the sweep under this playbook's no-source-edits boundary — list them
     in the report instead of editing them.
   - **Everything the adoption produced is meant to be committed** — the
     config, the generated artifacts, and both ledgers
     (\`.blueprint-baseline.json\`, \`eslint-suppressions.json\`): the
     gates read the ledgers from the repo, so an uncommitted baseline is
     a ratchet that only works on your machine. Not a VCS repo (or you
     lack commit rights)? Leave the files in place and say so in the
     report — never initialize version control on the owner's behalf.
     The same boundary covers ongoing enforcement: blueprint deliberately
     scaffolds no CI — the gate commands (\`npx blueprint inspect
     --baseline\`, \`npx blueprint doctor\`) are the deliverable, and
     wiring them into a pipeline or git hook is the owner's call.
     Recommend it in the report; never add pipeline config yourself.

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
- **\`doctor\`'s leftover check matches exact file families** — this
  playbook, the command file, \`*.blueprint.*\` references, and
  marker-bearing contracts outside \`emit.agents\` — never other files,
  whatever their names. A report or feedback file you were asked to
  write is safe without a verification re-run.
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
  join every structural ban alongside the main alias — with their target's
  offset baked in (\`'~root': '.'\` bans \`~root/src/views/**\`); an alias
  into a subfolder has no layer surface, so it carries no layer bans.
- \`no-restricted-syntax\` — re-export bans for \`selfOnly\` importers,
  emitted ONLY when an allowedImporters ENTRY declares it
  (\`allowedImporters: [{ layer: 'views', selfOnly: true }]\` — a
  layer-level \`selfOnly\` key is invalid and validation rejects it) —
  no selfOnly, no syntax rule to collide with your own
  \`no-restricted-syntax\`. \`blueprint rules\` annotates whether THIS
  config emits it — never probe emitLint to find out.
- \`no-restricted-globals\` — global ownership (e.g. \`{ global: 'fetch' }\`)
- \`blueprint/relative-escape\` — depth-aware \`../\` module escapes
  (embedded plugin; ships inside the emitted config)

**Optional gates — emitted only when declared** in \`rules\` with a tier
other than \`off\`; none of these emits by default, and every gate scopes to
the layer file globs — root wiring sits outside all of them. When merging,
collisions are decided by rule KEY, not by hit count — \`blueprint rules
--json\` names every key the emitted config sets, and carries the exact
selfOnly selector strings a fold needs. Adoption stance for these gates:
declare one only to translate an existing house threshold (carry its
value); switching NEW gates on is the owner's later tuning, not the
adopting agent's call. The metric family falls
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
    // Extra import roots beyond the alias. One whose target can contain
    // the layer folders (the source root, or above it — '~root': '.')
    // joins every structural ban with the offset baked in; a subfolder
    // alias like this one has no layer surface and carries no layer bans.
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
      // owns entries — the full shape (nothing else lives only in dist).
      // A package several layers may use: declare the SAME entry in each of
      // them — same-signature owns merge into one rule allowing every
      // declaring layer; the repetition IS the shared-allowance syntax.
      //   'axios'                                    whole package
      //   { package: 'vue', imports: ['inject'] }    named imports only
      //   { package: '@scope/*', pattern: true }     glob over import
      //     specifiers — npm scopes and alias paths ('~app/services/http*') alike
      //   { package: 'x', exempt: ['**/*.stories.*'] }  files exempt from the ban
      //   { global: 'fetch' }                        global identifier
      { name: 'services', does: '…', owns: ['axios', { global: 'fetch' }] },
    ],
    // Optional — omitting module (or any of its keys) IS the flat default
    // ({ layout: 'flat', entry: 'index' }); private: ['hooks', …] keeps
    // parts behind the entry.
    module: { layout: 'flat', entry: 'index' },
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
- [ ] This playbook and \`${COMMAND_FILE}\` are deleted, THEN
      \`npx blueprint doctor\` passes — doctor flags them as leftovers,
      so it is the last thing you run, not a mid-flow smoke test

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
