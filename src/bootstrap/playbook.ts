import { DOC_ONLY_RULES, METRIC_GATES, PLUGIN_GATES } from '../emit/lint';
import { COMMAND_FILE } from '../project';
import { scriptCommand } from './plan';
import type {
  ClaudeDirState,
  PackageManager,
  TscArtifactLocation,
  ViteTsCoverage,
} from '../project';
import { renderSurvey } from '../survey';
import type { SurveyResult } from '../survey';

/**
 * The authoring playbook, one function per emitted section.
 *
 * It used to be a single 590-line template literal inside `authoringBrief`, and
 * the cost was not its length: a paragraph had no name, so its only address was
 * its own text. Finding one meant reading the file, an `Edit` anchor could
 * collide with a passage that repeats deliberately, and the same shape let one
 * shared block be maintained as two hand-copied paraphrases (see
 * `printConfigCaveats`). A section with a name is greppable, its call site in
 * `authoringBrief` reads as the table of contents, and a duplicated passage
 * becomes one function called twice instead of two texts to keep in step.
 *
 * The prose is the product here — 79% of the old file was emitted text — so
 * nothing about the wording changed when it moved. Verified as byte-identical
 * output across every conditional combination.
 */

/** A repo counts as brownfield when src/ already holds this many source files. */
export const BROWNFIELD_MIN_FILES = 10;

/**
 * The four facts that make a *correct* resolved config look broken, for the two
 * paths that reach `--print-config`: the early-exit checklist's lint step, and
 * the merge step of Method 9. It was prose at both sites, and `git blame` names
 * two commits that edited BOTH copies in one pass — so hand-copied sync, not a
 * forgotten edit, and it still produced four divergent paraphrases (74.3%
 * similarity once whitespace is normalised). The wording kept here is the merge
 * step's: two later commits reached that copy and not the checklist's, so it is
 * the newer text, which is the reason rather than that it reads tighter.
 *
 * Both sites open the sentence themselves — the checklist says "read the output
 * knowing four things", the merge step "Four things to know before reading that
 * output" — because there the framing genuinely differs. This carries the part
 * that must not.
 *
 * `indent` is the continuation indent of the list the caller sits in (three
 * spaces inside a numbered item, five inside a bullet under one). The lines are
 * wrapped for the deeper one and reused at the shallower, so the checklist's
 * copy sits two columns short of the margin — invisible once rendered, and
 * cheaper than a re-wrapper that would have to be right at both widths. The
 * first line carries no indent: it continues the caller's own line.
 */
function printConfigCaveats(): string {
  return [
    ', or a correct config looks broken: resolved keys carry their plugin prefix (`@stylistic/max-len`, never bare `max-len`); a rule scoped to a layer that holds no files does not appear at all (inspect\'s `declaratory-self-only` note, not a loss); selfOnly\'s re-export ban resolves on the IMPORTER layer inspect names, not on the layer being protected; and **inspect\'s finding names are not ESLint rule ids** — `deep-import`, `flow-violation` and `package-ownership` all fold into the single `no-restricted-imports` entry, so searching for `blueprint/deep-import` finds nothing and proves nothing.',
    'Inspect\'s migration steps name the carrying rule for each finding, and mark the ones no lint run will ever show.',
  ].join(' ');
}

/**
 * What authoring leaves behind, for every site that instructs its removal. The
 * early-exit checklist named all of it — the two files and the directories init
 * created for them, with `claudeDir` deciding whether `.claude/` is one of
 * them. The Method's finish step and the acceptance gate said "the two authoring
 * files", so an agent on the Method path was told to delete two files and nothing
 * about the two directories it had just watched init create. It invented the
 * `rmdir` and reported having to (field run #124) — correctly, and off a fact the
 * tool already measures.
 *
 * Same shape as `printConfigCaveats`: one passage, four call sites, wrapped for
 * the deepest indent and reused at the shallower ones. Three copies of a rule
 * with a branch in it is how the branch goes missing from two of them.
 *
 * The fourth site is the banner, and it was the miss in #124's own fix: the
 * extraction covered the three sites that listed targets and left the header
 * naming two files — the version that opens the document, and so the one a
 * reader takes for the authoritative short form. Its "doctor flags BOTH as
 * leftovers" then read as confirmation that the two files were the whole list.
 * Nothing downstream catches the difference: doctor's leftover check matches
 * file families and never looks at a directory (run #145).
 */
function cleanupTargets(claudeDir: ClaudeDirState): string {
  // The owner's own commands live here too, and "now-empty" was asserted about a
  // directory the tool can read. Half of this sentence was already measured — the
  // `.claude/` arm — so a field agent with `my-existing-command.md` beside blueprint's
  // got the pre-existing `.claude/` right and `commands/` wrong in the same breath
  // (field run #139). Nothing about `.claude/` needs deciding when its child stays.
  if (claudeDir.otherCommands > 0) {
    return `this playbook and \`${COMMAND_FILE}\`, and nothing else: `
      + `\`.claude/commands/\` holds ${claudeDir.otherCommands} other command file(s) that `
      + 'are the owner\'s, so it and `.claude/` both stay.';
  }

  return [
    `this playbook, \`${COMMAND_FILE}\`, and the now-empty`,
    ...(claudeDir.hadDir
      ? [
          '`.claude/commands/` directory — but NOT `.claude/` itself: it was already here before this run, so it is the owner\'s, whatever ends up left in it.',
        ]
      : [
          '`.claude/commands/` directory — and `.claude/` itself, which init created only to hold this command (it was not here before this run).',
        ]),
  ].join(' ');
}

/**
 * The Next.js addendum, appended to the H1 — the route tree is itself a layer,
 * and `src/pages` beside the App Router is a routing convention, not a layer to
 * scaffold. Empty on every other framework.
 */
export function renderNextNote(next: boolean): string {
  if (!next) return '';

  return [
    '',
    '',
    '> **Next.js project.** The route tree (`app/`, or `pages/` on the Pages Router) is itself a layer — declare it at the top of the flow (a typical shape: `app` → `components` → `hooks` → `lib`).',
    '> Never scaffold or declare an empty `src/pages` alongside the App Router: that folder name is a routing convention.',
    '> Flat module layout fits the route tree — relative imports stay free inside a segment while cross-layer traffic uses the alias.',
  ].join('\n');
}

/**
 * Which build to run, from a measured fact rather than a per-repo instruction.
 *
 * Three releases running, this was prose about the adopter's tsconfig: first an
 * assertion that a Vite + TS starter keeps `vite.config.ts` inside a tsconfig
 * project (false on the shape this repo's own harness stages), then an
 * instruction to go read it, which was correct and still grew a conditional
 * premise and a fused-attribution problem in the two batches after. Every one of
 * those findings landed in this same paragraph, which is the signal that prose
 * was doing a program's job. `viteTsCoverage` reads the tsconfig graph instead.
 *
 * `null` is the honest third case — an `exclude` list, an `extends` base, a glob
 * shape the reader will not guess at — and there the original wording stands,
 * because "go and look" is exactly right when the tool could not.
 */
function renderBuildChoice(viteTs: ViteTsCoverage | null, pm: PackageManager): string[] {
  const shared = [
    '   Never report that a build verified the vite edit without having established that the build reads the vite config: that claim is the one thing this step can get silently wrong, and `tsc -b` exiting 0 is not evidence for it.',
  ];

  if (viteTs === null) {
    return [
      '   **Which build, though — and where `tsc -b` is enough, prefer it.** It answers the only question available here without emitting a bundle into a tree that may have nowhere to put one (see below).',
      '   **Whether `tsc -b` covers your vite edit is a fact about THIS repo, and this run could not settle it — read it, do not assume it.** Templates differ: many put `vite.config.ts` inside a tsconfig project (commonly a `tsconfig.node.json` reached through `references`), and there `tsc -b` type-checks the vite edit too; others leave a single root config at `include: ["src"]`, and there `tsc -b` never reads the file you just edited — it exits 0 whatever you put in it.',
      '   Open the tsconfig(s) and see which one you have.',
      '   Inside a project, `tsc -b` is the build to prefer here.',
      '   Outside every project — or once layer files exercise the alias — run `npx tsc -b` and then the vite build separately: together they cover what the full build covers, and only the split lets you say which edit each one verified.',
      ...shared,
    ];
  }

  if (viteTs.verdict === 'covered') {
    return [
      `   **Which build: \`npx tsc -b\`, and that is measured, not assumed.** This repo's \`${viteTs.tsconfig}\` pulls \`${viteTs.viteFile}\` into a tsconfig project, so \`tsc -b\` type-checks the vite edit along with the tsconfig one — a single command covering both, without emitting a bundle into a tree that may have nowhere to put one (see below).`,
      `   Report it as the one build that read both files.`,
      ...shared,
    ];
  }

  return [
    `   **Which build: \`npx tsc -b\` and then the vite build, separately — and that is measured, not assumed.** No tsconfig project in this repo pulls \`${viteTs.viteFile}\` in (\`${viteTs.tsconfig}\` was read for it), so \`tsc -b\` never reads the file you just edited and exits 0 whatever is in it.`,
    `   The vite build is the only one that loads it.`,
    `   Run them as two commands rather than one \`${scriptCommand(pm, 'build')}\`: together they cover the same ground, and only the split lets you report which edit each one verified — fused into one result, "the tsconfig edit type-checks" and "the vite config loads" arrive as a single green you then have to hedge.`,
    ...shared,
  ];
}

/**
 * The early-exit verdict, and only below the threshold.
 *
 * The most common repo `init` ever meets is a starter, and the correct outcome
 * there is the early exit — a conclusion that must not sit buried mid-playbook
 * where a hurried agent walks the full ceremony past it (field batch 10). Below
 * the threshold the verdict leads, carrying the complete checklist so nothing
 * else in the file applies.
 */
/**
 * What the build leaves behind and who owns it. `tsc -b` writes a
 * `*.tsbuildinfo` even under `noEmit`, so the early exit's verification step
 * produces untracked files in someone's working tree — a step THIS playbook asked
 * for, which is why it has to say so rather than leave a mess unexplained.
 *
 * The lead-in belongs to the first line rather than to the call site. It sat there,
 * as its own element ending in "and", so the `\n` join put a line break inside the
 * sentence and the emitted document had one line that was not one — the exact thing
 * the sentence-per-line pass removed everywhere else, surviving inside it. Different
 * from the long-line wrinkle a spliced `${…}` helper leaves: that one keeps the
 * sentence whole, this one split it and made it ungreppable.
 */
function renderBuildArtifacts(tscOut: TscArtifactLocation | null): string {
  // Measured, because the paragraph below opens on a premise about this repo and the
  // premise is false on the shape `npm create vite` generates: `noEmit: true` plus a
  // `tsBuildInfoFile` under `node_modules/` leaves the working tree untouched, so an
  // agent told to report untracked files reports files that do not exist (field run
  // #135). Only the certain negative specialises — everywhere else the wording below
  // is right, including every repo whose vite build writes a bundle.
  if (tscOut !== null) {
    return [
      `   **\`tsc -b\` leaves nothing in this working tree, and that is measured.** \`${tscOut.tsconfig}\` sets \`noEmit\` and sends the build info to \`${tscOut.buildInfo}\`, which is out of the way by convention — so the build you just ran produced no untracked file here to decide about.`,
      '   The four cells below still decide the bundle, and only if you ran the vite build: that one does write into the tree.',
      '   Ran only `tsc -b`? Then the tree is as you found it, and the report says that rather than picking a cell — saying "I removed the artifacts" when none existed is the same wrong sentence as leaving a mess unexplained.',
      ...renderArtifactCells(),
    ].join('\n');
  }

  return [
    '   Its artifacts (`dist/`, `*.tsbuildinfo`) are the build\'s normal output, and **`tsc -b` writes a `*.tsbuildinfo` even under `noEmit: true`** — build mode\'s book-keeping of what it already checked, not emitted program output, so the two settings do not conflict and the file is safe to delete.',
    '   Stated because the opposite reading is the natural one: an agent that just opened the tsconfig to answer the paragraph above has `noEmit: true` in front of it, and a file appearing anyway looks like the build overriding the config.',
    '   Where it lands is the repo\'s call: a `tsBuildInfoFile` pointing under `node_modules/` keeps it out of the tree entirely, and this run could not establish that either way.',
    ...renderArtifactCells(),
  ].join('\n');
}

/**
 * The four cells, shared by both arms above. One text, because the measured arm needs
 * the same decision for the bundle that the default arm needs for everything — and
 * two copies of a four-way decision is how a cell goes missing from one of them.
 */
function renderArtifactCells(): string[] {
  return [
    '   Either way they are not adoption leftovers: leave them to the repo\'s own ignore rules, and say so in the report instead of guessing a cleanup when those rules will not cover it.',
    '   Two independent facts decide that, not one — whether the repo HAS ignore rules, and whether it is under version control at all — and a repo can be any combination.',
    '   A `.gitignore` listing `dist` in a tree that is not a git repo is a rule with nothing to enforce it; no `.gitignore` under git means the artifacts show up in `git status`; neither means "untracked" describes every file in the tree and the word stops distinguishing anything.',
    '   Say which of the four you are in — it is one sentence, and it is the difference between a report the owner can act on and one they have to re-derive.',
    '   Say it as what it is — a step THIS playbook asked for produced untracked files in someone\'s working tree — and say that deleting them is safe, because nothing adoption wrote depends on them and the build can be re-run.',
    '   Then it is the owner\'s call rather than an unexplained mess: "leave them" without that sentence reads as "you may not touch these", which is not what it means.',
  ];
}

/**
 * The artifact hand-over, as three rules instead of a four-cell table. Naming all
 * four combinations of ignore-rules x version-control still left one cell
 * undecided, and three consecutive field runs called it a coin flip; these
 * paragraphs decide it, and say what "your own verification step" does not cover.
 */
function renderArtifactHandover(): string {
  return [
    '   **One of the four cells decides itself: no ignore rules AND no version control.** There, "leave them to the repo\'s own ignore rules" names rules that do not exist and an owner who has no `git status` to see them in — so remove what your own verification step created, and say you did.',
    '   That is not the owner\'s call being taken from them: it is the same reason this path prefers `tsc -b`, applied one step later.',
    '   The tree you hand back is the tree you were given.',
    '   In the other three cells leave the artifacts alone: `git status` surfaces them, or an ignore rule names them, and either way something other than your report is keeping track.',
    '   **An ignore rule with no git behind it still counts as the second kind, and the distinction is declared against enforced.** A `.gitignore` listing `dist` in a tree that is not a git repo enforces nothing today — said plainly above — and it is still the repo author writing down that this artifact is disposable, which takes effect the moment anyone runs `git init`.',
    '   That declaration is what you leave the artifact on.',
    '   The cell that decides itself is the one with no declaration anywhere: no rule to go dormant, no history to surface it, nothing but your report.',
    '   Read those two sentences together or they read as a contradiction — enforced today is not the test; declared at all is.',
    '   **"Your own verification step" is narrower than "untracked", and in this cell nothing else marks the difference.** Three kinds of file end up untracked here and only the first is yours to remove: what a verification command produced (`dist/`, `*.tsbuildinfo` — remove); what `init` produced, including the install (`node_modules/`, a written or rewritten lockfile, the config, the emitted contract and handbook — these are the adoption, keep every one); and whatever was already in the tree before you started, blueprint\'s or not (leave untouched, and do not report it as adoption\'s).',
    '   Deciding this by "is it untracked?" deletes the deliverable; deciding it by "did I run the command that made it?" does not.',
  ].join('\n');
}

/**
 * The early exit's verification step — 81 of the verdict block's 106 lines, the
 * same shape step 9 has inside the Method: one numbered item that is really a
 * section. Long because a green lint and a green build on a near-empty repo prove
 * less than they look like they prove, and every clause is a field finding about
 * that gap — which build to run, what `--print-config` does and does not compare,
 * and the four ways a correct resolved config reads as broken.
 *
 * Takes `viteTs` because this is where the build choice is *answered from the
 * repo* rather than asserted about it: field #99 disproved the universal that
 * replaced it, and a measurement is the fix that holds.
 *
 * Named so the next finding about it lands somewhere that has a name, instead of
 * in the middle of a numbered list nothing can address.
 */
function renderEarlyExitVerify(
  viteTs: ViteTsCoverage | null,
  tscOut: TscArtifactLocation | null,
  pm: PackageManager,
): string {
  return [
    `3. Did init write \`eslint.config.blueprint.mjs\`?`,
    `   It does exactly when the repo already has its own eslint config: merge it — spread \`...emitLint(blueprint, …)\` AFTER your existing entries, following the reference's inline notes — then DELETE the reference; doctor stays red until you do.`,
    `   No reference written (init's generated config IS the live one)?`,
    `   That gate holds trivially, and trivially true is true — you skipped nothing.`,
    `   Either way, close this step by running the project's own lint once (\`${scriptCommand(pm, 'lint')}\`, or \`npx eslint .\` without a script): doctor's wired check reads config text and never executes eslint, so only a real run proves the config loads.`,
    `   A green lint is not proof the gates are ATTACHED, and on a repo whose layers hold no files yet it proves only that the config parses — there is nothing for a rule to fire on.`,
    `   That gap is doctor's job, not yours: its survival check resolves every declared gate that rides an injected plugin and reds when one resolved to nothing, so **you do not need to print configs by hand on this path**.`,
    `   Reach for \`npx eslint --print-config <file>\` only for what doctor's ✓ says it does NOT compare — thresholds, package-ownership entries, and the survival of your OWN rules — and read the output knowing four things${printConfigCaveats()} Same logic for the alias: init edited \`tsconfig\`/\`vite\`, and doctor's alias check reads that wiring as text, never as a compile — run a build once too.`,
    `   The same caveat as the lint run applies, and for the same reason: on a repo whose layers hold no files, nothing imports through the alias, so a green build proves the \`tsconfig\`/\`vite\` edits parse and compile — NOT that the alias resolves.`,
    `   It becomes that proof the first time a layer file imports through it.`,
    `   Run it anyway (cheap, and it catches an edit that broke the config outright) and report which of the two you got.`,
    ...renderBuildChoice(viteTs, pm),
    renderBuildArtifacts(tscOut),

    renderArtifactHandover(),
  ].join('\n');
}

export function renderVerdict(
  survey: SurveyResult,
  claudeDir: ClaudeDirState,
  viteTs: ViteTsCoverage | null,
  tscOut: TscArtifactLocation | null,
  pm: PackageManager,
): string {
  if (survey.totalFiles >= BROWNFIELD_MIN_FILES) return '';

  return [
    '',
    '',
    '## Read this first — the survey already points at the exit',
    '',
    `The survey counted ${survey.totalFiles} source file(s) — below the brownfield threshold (${BROWNFIELD_MIN_FILES}).`,
    `At this size the expected conclusion is the early exit, and **following this verdict IS executing the playbook fully** — early exit is completion, not abandonment.`,
    `Walk the full method below only if you find structure the file count hides: existing intent documents (Method step 1) or meaningful layer folders.`,
    '',
    'The complete early-exit checklist — nothing else in this file applies:',
    '',
    '1. `npx blueprint init --preset --agent claude` (or `--agent codex`) — scaffolds config + artifacts with YOUR contract declared: the flag persists into `emit.agents`, so one run emits one contract file.',
    '   Running as neither tool?',
    '   Plain `--preset`, then declare `emit.agents` in the config and re-run init.',
    '2. `npx blueprint impact` (0 hits → skip `--suppress-all` entirely; an empty suppressions ledger is ceremony) and `npx blueprint inspect --baseline` — both exit 0. (`--update-baseline` is deliberately not on this list: with zero debt it is a no-op that writes nothing — the full method runs it because brownfield repos have debt to lock; a clean early exit has none.)',
    renderEarlyExitVerify(viteTs, tscOut, pm),
    `4. Delete ${cleanupTargets(claudeDir)} Cleanup comes BEFORE the final gate: doctor treats these authoring files as leftovers.`,
    `5. \`npx blueprint doctor\` — all checks green, and a \`⊘\` is not green: a skipped check keeps exit 0 while what it verifies stays unverified, so fix what that line names and re-run before you report done.`,
    `   Then commit what adoption wrote, if you can: a ratchet that lives only in an uncommitted working tree is not installed.`,
    `   Not a VCS repo, or no commit rights?`,
    `   Leave the files where they are and say so in your closing reply — never initialize version control on the owner's behalf.`,
    `   (The full method states this too; it is repeated here because this checklist is the whole of your instructions and a handoff you have to go looking for is one you can miss.) Done — "preset was enough", said in your closing reply to the user, is a complete, correct report; no report file exists on this path.`,
    ``,
    `**Why adopt on a near-empty repo at all — emptiness is the point, not a smell.** The contract's value is highest BEFORE the first violation exists: this is the one moment governance costs nothing to install and nothing to retrofit.`,
    `The six declared layers, the unused alias, the vacuous-but-honest gates are all forward-looking by design — "what correct looks like" gets pinned down now, and the net arms itself as code lands.`,
    `Do not read the emptiness back to yourself as over-engineering; the expensive version of this repo is the one that adopts two years and 400 files later.`,
  ].join('\n');
}

/**
 * Title, the provenance banner, and the two conditional blocks that ride with
 * them. The banner states the deletion up front because `doctor` treats this
 * file and the command file as leftovers while they remain.
 */
export function renderHeader(
  nextNote: string,
  verdict: string,
  claudeDir: ClaudeDirState,
): string {
  return [
    `# Blueprint authoring playbook${nextNote}`,
    '',
    `> Generated by \`blueprint init\`.`,
    `> Execute top to bottom, autonomously — do not stop to ask for confirmation.`,
    `> When you finish, delete ${cleanupTargets(claudeDir)} Then \`blueprint doctor\` has the final word: it flags the two files as leftovers while they remain.${verdict}`,
  ].join('\n');
}

/**
 * The one precondition: the package must be a devDependency, because the config
 * the agent writes imports it and every `npx blueprint` step resolves it from
 * the project.
 */
export function renderPrerequisites(install: string): string {
  return [
    '',
    '## Prerequisites',
    '',
    '`@kekkai/blueprint` must be a devDependency — the config you will write imports it, and every `npx blueprint` step resolves it from the project.',
    '`init` already installed it unless `--no-install` was passed; verify, or run:',
    '',
    '```bash',
    `${install}`,
    '```',
  ].join('\n');
}

/**
 * What is being installed and where the job stops: the four deliverables, the
 * no-refactor boundary, and the three verdicts an agent must be licensed to
 * reach — the preset early exit, the honestly empty net, and drafting before
 * reading. Each one exists because a field run talked itself out of it.
 */
export function renderGoal(): string {
  return [
    '',
    '## Goal and boundary',
    '',
    '**Know what you are installing.** Blueprint is a governance tool for AI-driven development: its job is to keep agents — including you, and every agent that touches this repo after you — from drifting outside the declared architecture.',
    'The strictness is the product, not a cost to negotiate down.',
    'When you feel the urge to soften a tier, skip a gate, or leave yourself an escape hatch, that urge is exactly what this tool exists to catch: install faithfully, and put disagreements in the report for the maintainer — never into a weakened config.',
    '',
    'Author `blueprint.config.mjs` for this repository so that its architecture rules match the code\'s *intent*, then generate the artifacts and lock the baseline.',
    'Deliverables:',
    '',
    '1. `blueprint.config.mjs` — validated, findings explainable',
    '2. `npx blueprint init` artifacts (lint config, handbook, agent contracts)',
    '3. `npx blueprint inspect --update-baseline` run — it writes `.blueprint-baseline.json` only when debt exists; on a clean repo "No debt to lock" and no file IS the correct outcome',
    '4. A short report: the layer table, debt counts by category, any cycles.',
    '   It is a message, not an artifact — deliver it as your closing reply to the user (or the PR description when one is opened); never commit a report file',
    '',
    'Out of scope: fixing the debt.',
    'Existing violations are recorded in the baseline and paid down later — do not refactor application code in this pass.',
    '',
    `**Early exit is a legitimate verdict.** On a repo below the brownfield threshold (${BROWNFIELD_MIN_FILES} source files) whose shape a framework preset already fits, the correct conclusion is to run \`npx blueprint init --preset\`, wire its outputs, delete this playbook and the command file, and stop.`,
    `Walking the full method on a starter is ceremony, not judgment; this playbook earns its cost on repos whose layer boundaries have grown fuzzy.`,
    '',
    '**An empty net is equally legitimate.** On a root-only app the layer rules reach nothing — that is the true state, not a failure to fix.',
    'Never invent a layer to make coverage non-zero (a `*` name, a glob contortion): root files are wiring, and their hygiene (line counts, unused vars) belongs to the project\'s own lint, not to a manufactured layer.',
    'The net starts biting when code lands inside declared layers.',
    'The inverse also holds: a preset\'s declared-but-empty layers are the runway, not a manufactured net — declaring intent costs nothing and `inspect` tracks them honestly (missing-layer info, the coverage line), so keep them.',
    '**Runway comes in three shapes, and `inspect` names two of them.** An empty layer gets its note, and so does an `owns` entry for a package the repo has not installed (a preset\'s `hooks` owns `zustand` whether or not you use it) — an `owns-not-installed` note naming the layer that declares it.',
    'An alias no import uses yet gets none — nothing imports it, so there is nothing to count and no finding to raise.',
    'All three are still runway: they say where a thing goes if it arrives, ban nothing until then, and need no dependency added to justify them.',
    'Keep them on the same default as the layers, and know that the alias is the one shape you have to recognize yourself rather than read off a report.',
    'Keeping is the DEFAULT — the preset layers are the baseline, and slimming them is the project owner\'s later decision, never the adopting agent\'s.',
    'When a declared-but-empty layer ALSO looks stale, the tiebreak is prose intent: an intent document describing it as a future seam makes it runway (keep); one the prose never mentions, contradicted by where the code actually lives, is a stale clause (downgrade it and record the conflict — Method step 1).',
    '**A drawn diagram is part of what that document says.** A layer absent from every per-layer section but still drawn in the same file\'s flow graph HAS been mentioned — read both before calling a clause unmentioned, or the tiebreak decides on half the evidence and drops a layer the document is still declaring.',
    '**Those two branches are not a partition, and the third state is the common one: mentioned, but nowhere described as intent.** A box in a diagram and nothing else is exactly that — it says the clause is not stale without saying it is a seam, so neither branch fires.',
    'Do not force it into one.',
    'Keeping is already the default, so keep it and hand the owner the specific question: this layer is drawn in <file> and described nowhere, and the code it names lives at <path> instead.',
    'That sentence is worth more than a verdict you reached by picking the nearer branch — the owner knows which of the two the drawing meant, and you do not.',
    'Adding a state to the diagram-mention rule is what opened this gap: broadening "mentioned" narrowed the stale branch and left the middle unowned, so it is named rather than implied.',
    '',
    '**Work the loop, not the archive.** Everything below is evidence and reference — it is NOT a syllabus to master before touching the config.',
    'Draft `blueprint.config.mjs` early from the survey and the rule catalog, then let `inspect` correct you: it is read-only, cheap, and needs nothing installed, and a wrong draft fixed in two runs beats a perfect draft after an hour of code archaeology.',
    '`impact` is the same kind of read-only feedback but is NOT available at this point — it lints with the emitted config, so it needs the plugins `init` installs; it joins the loop at Method step 9, after init.',
    'Reaching for it while drafting only earns you a load error.',
    'In field runs, agents that drafted first finished in a fraction of the time of agents that studied first — at the same quality, because the acceptance gates are the same.',
    'And if you ever feel the need to read the package\'s `dist/` bundle to answer a question, stop: the answer belongs in this playbook — note the gap in your report instead.',
  ].join('\n');
}

/**
 * The three chained paragraphs about building the combined `no-restricted-*`
 * entry: one per collision rather than one per rule key, how to combine when the
 * spread is opaque, and what to do when the two sides' file scopes were never the
 * same. They stay together because each opens by referring to the last — this is
 * the one place in the playbook where the order really is load-bearing.
 *
 * All three used to rest on a premise that is false, and field issue #163 is an
 * agent following it into a wrong scope decision: that the hand-written entry is
 * the only carrier of blueprint's ban, so it must hold the SAME file scope and a
 * mismatch has to be resolved by widening to blueprint's glob. Flat config is
 * per-FILE — an entry contributes nothing to a file it does not match — so the
 * spread stays the carrier everywhere the hand-written entry does not reach, and
 * narrowing cannot make blueprint's ban lose a file. Measured with
 * `eslint --print-config`, one probe per direction, on **both majors CI runs** —
 * every cell resolved identically under 9.39.5 and 10.8.0, so none of this rests on
 * one version's behaviour:
 *
 * - combined entry narrowed to `.vue`: the layer's `.js` file still resolves
 *   blueprint's selector, from the spread. Narrowing costs blueprint nothing.
 * - same glob, blueprint's selectors left out: the ban is gone on every file the
 *   entry matches. THAT is the silent loss, and it is about contents, not scope.
 * - original house entry folded away, combined entry kept at the collision: the
 *   house rule's own outlying files resolve nothing. The silent direction runs
 *   against the rule you brought, which doctor states it does not compare.
 * - the arrangement now recommended (original entry untouched + combined entry at
 *   the collision, last in the array): all five file classes resolve exactly the
 *   rules they had, including the collision's test files, which the untouched
 *   original still governs after blueprint's `ignores` lifts the combined entry
 *   off them. That last cell is why renderTestExemptions no longer has to pick.
 * - that same arrangement with the combined entry ABOVE the original: the overlap
 *   resolves the house selector alone and blueprint's is gone there. The
 *   recommendation is order-dependent, so it says so — as a property of the entry
 *   the reader is about to write ("put it last"), which is satisfiable without
 *   touching a config that already exists.
 * - the repair this paragraph gave first — lift an original that sat below the
 *   spread above it — on a house entry that also sets `no-restricted-imports`: the
 *   collision key resolves correctly either way once the combined entry is last,
 *   while that OTHER key flips from the house's paths to blueprint's on the move.
 *   Any instruction to reorder an existing entry silently re-decides every key it
 *   carries, which is the loss this paragraph exists to prevent, so the constraint
 *   is stated on the new entry instead and nothing has to move.
 *
 * "Last" belongs to the second paragraph rather than the third, because the third
 * is entered only when the two scopes differ and the ordering binds either way: a
 * reader whose scopes match, keeping the original entry as the paragraph above
 * warns them to, needs the combined one below it too. Stating "after the spread"
 * there and the full condition only in the scope-mismatch branch would have left
 * the generator unqualified while the branch downstream of it was correct — the
 * same shape as the defect #163 filed.
 *
 * The premise entered one day before #163 (bd3d2f1, field runs #95–#97) as
 * reasoning about which failure is louder, never as a measurement. Prose is the
 * right medium for this — it is doctrine about ESLint, not a fact about the
 * adopter's repo — but the asymmetry it asserted was backwards.
 */
function renderCombinedEntry(): string {
  return [
    '     **"ONE entry" means one per COLLISION, not one for the whole rule key.** emitLint scopes its entries per layer, so a rule key can have several — a `selfOnly` layer with two importers emits `no-restricted-syntax` on BOTH importer layers, and your own rule may overlap only one of them.',
    '     Combine with the entry you actually collide with, and leave the others exactly as emitted.',
    '     Widening your combined entry to cover the other layers as well is the way to get this wrong: it imposes YOUR rule on files it never governed, and one field run widened a date-guard onto a layer\'s `.js` and took 38 errors in a single test file that deliberately relaxes it.',
    '     Scoping it narrowly is NOT the opposite error — by the qualifier above, the layers you leave out keep the entry the spread emitted, unchanged.',
    '     Check the emit points before merging, not after: `npx blueprint rules --json` lists the selectors per layer, so two importers show up as two.',
    '     If you get it wrong anyway, doctor\'s survival check probes every layer separately and names the one that lost its selectors — it is a red you can act on, not a silent pass.',
    '',
    '     **How you combine, given that `...emitLint(blueprint)` is opaque.** You cannot reach inside the spread to edit the entry it emits, so do not try: write the combined entry yourself and place it LAST — after the spread, and after your own original entry wherever that one already sits.',
    '     That is the same later-replaces-earlier property this paragraph opens by warning about, used deliberately — the LAST entry to set that key on a file is the one that governs it there, so yours is the effective one only while nothing after it sets the key again.',
    '     Which is exactly why it has to carry everything the emitted one ENFORCED there: both option sets\' patterns and selectors, and the emitted `ignores`.',
    '     The ban message is the one part that is NOT among those: that text is yours to write, doctor compares selectors and never messages, so nothing here sends you into a dump to retrieve a sentence.',
    '     `rules --json` says the same beside the selectors.',
    '     **Scope is not on that list, and the two silent losses are about what the entry CONTAINS.** Leave blueprint\'s selectors out of an entry that matches its files and the ban is gone there — doctor\'s survival check turns that red.',
    '     Fold your own original entry away and keep only the combined one, and your rule quietly stops governing the rest of what it used to — doctor does not compare the rules you brought, and says so, which is what the probe below is for.',
    '     Confirm with `npx eslint --print-config`, and the affected layer takes TWO probes rather than one: a file INSIDE the collision and a file OUTSIDE it, because the arrangement below deliberately makes those two resolve different entries — and the inside one is also what catches a wrong entry order.',
    '     Add one file your own rule governed outside that layer, for the loss doctor cannot see — that is the whole probe. This is the one place print-config is not optional: doctor resolves a single path per layer, and its ✓ says an entry scoped to part of a layer is not compared, which is now the shape you are aiming for.',
    '',
    '     **When the two sides\' scopes were never the same, do not reconcile them — the collision is the entry, and neither side moves.** A house rule framed at `**/*.vue` folded into a layer glob of `.{js,vue}` is the ordinary case: scope the combined entry to `**/*.vue` inside that layer, and leave your original entry in place rather than folding it into the new one.',
    '     Three entries then cover three sets, and none of them gives a file a rule it never had: yours keeps the files blueprint never governed, the spread keeps the `.js` files your rule never governed, and the combined one wins where they meet.',
    '     **The placement above is what makes the three of them work, and it still asks nothing of the entries you have: combined one last, yours wherever it already sits.** Put the combined one above your original instead and that original wins the overlap again — your bare rule back on top, blueprint\'s selectors gone there.',
    '     Lifting your original entry over the spread satisfies the same ordering and is the wrong repair: other rule keys ride along on it, and measured, one that also set `no-restricted-imports` flipped from its own paths to blueprint\'s the moment it moved — silently, while the key you came here for looked right either way.',
    '     Say in the report which set each of the three covers.',
    '',
  ].join('\n');
}

/**
 * The `ignores` trap: a combined entry rebuilt from selector strings has no test
 * exemption unless it is written back. Separated from the merge mechanics because
 * dropping blueprint's `ignores` is loud only when a house rule collided on those
 * test files and silent otherwise, and doctor compares selectors rather than scope
 * so nothing downstream catches it. One real run spent a debug cycle on 34 errors
 * in a single test file getting this wrong.
 *
 * This used to read "it fails in both directions" — the mirror being that carrying
 * blueprint's `ignores` onto the combined entry strands YOUR rule on test files it
 * used to govern. #163 closed that direction rather than balancing it: the combined
 * entry now covers the collision only and the original entry stays above it, so
 * those test files keep the house rule once blueprint's `ignores` lifts the combined
 * entry off them (measured — see renderCombinedEntry). One direction now, not two.
 */
function renderTestExemptions(): string {
  return [
    '     **An entry is more than its selectors — carry the emitted block\'s `ignores` too.** Every structural entry exempts test files, and a combined entry you rebuild from selector strings has no such exemption unless you write one.',
    '     `rules --json` gives it to you as `testExemptions` beside the selectors, and the text output prints the `ignores` line to paste.',
    '     Skip it and your combined entry starts governing test files: loud if your own rule collided there (a real run lost this and spent a debug cycle on 34 errors in one test file), silent if only blueprint\'s ban did — lint stays green while the test files it was never meant to reach are quietly under it.',
    '     Doctor compares selectors, not scope, so nothing downstream catches this.',
    '     The same move runs the other way when YOUR rule had no exemption: carrying blueprint\'s `ignores` onto the combined entry stops your rule at test files it used to govern — inside the collision only, and that is the second reason the paragraph above leaves your original entry in place, since it still governs those test files and nothing has to be given up.',
    '     Check whether the same rule appears on other layers you did NOT merge, because that is where an asymmetry you introduce here lands.',
    '',
    `     \`blueprint doctor\` verifies both the emitted structural rules and each declared gate's carrier rule survived the merge — so a hand sweep of the emitted gates duplicates it.`,
    `     What doctor does NOT compare is thresholds, package-ownership entries, and the survival of the rules YOU brought to the merge, and its ✓ says so.`,
    `     That remainder is what \`npx eslint --print-config <file>\` is for; a green lint run does not substitute, since it proves the config loads, not that a given rule reached a given file.`,
    `     Four things to know before reading that output${printConfigCaveats()} Run the project's own lint command; new findings introduced by the merge are fixed or explicitly judged, never left dangling — and when init wired the alias into \`tsconfig\`/\`vite\`, run the build once too (doctor's alias check reads wiring as text, never as a compile).`,
    `     Merging into a TypeScript config file (\`eslint.config.ts\`)?`,
    `     Importing \`./blueprint.config.mjs\` trips TS7016 when the tsconfig covering that file lacks \`allowJs\` — add \`allowJs: true\` there (often \`tsconfig.node.json\`), or ship a one-line \`blueprint.config.d.mts\` declaring the default export as \`Blueprint\`; name the choice in the report.`,
    `     Delete the reference once wired.`,
    `     Exception: a **legacy-format config** (\`.eslintrc.*\`) needs a flat-config/ESLint-9 migration that can break the project's own lint pipeline — do not do that unilaterally; surface it as a decision item in the report instead.`,
  ].join('\n');
}

/**
 * Method step 9's lint-merge bullet — 127 lines and the largest single passage in
 * the playbook, because a flat-config merge is where adoption most often goes
 * quietly wrong: a later entry REPLACES an earlier one, so a merge that reads
 * clean can delete a defense while lint stays green.
 *
 * Deliberately not split further, though it is still the biggest thing here. Its
 * paragraphs are one continuous argument — each refers back to the last ("that is
 * the same later-replaces-earlier property this paragraph opens by warning
 * about", "The same move runs the other way") — so cutting it into five functions
 * would make their ORDER load-bearing while stating it nowhere. That is the exact
 * defect the section-order test guards at the document level; no reason to
 * manufacture a second instance of it inside one bullet.
 */
function renderLintMerge(): string {
  return [
    '   - **Wire the lint.** If `eslint.config.blueprint.mjs` was written, merge it into the existing flat config: spread `...emitLint(blueprint, …)` — **carrying its options object over whole**: `stylistic` and `imports` always, plus `typescript: tseslint.plugin` on TypeScript projects.',
    '     Those arguments are load-bearing, not decoration: five gates ride an injected plugin (`codeStyle`, `statementsPerLine` and `statementPadding` on stylistic; `importBlock` on imports; `explicitAny` on the TS one) and a gate whose plugin is missing emits NOTHING while lint still passes — a dropped argument reads exactly like a clean merge.',
    '     **Declared no gates from those families?** Pass the carriers anyway, and let `init` install them: that is deliberate, not over-installation.',
    '     They sit inert until a gate names them, and paying for them now makes turning one on a one-line edit to `blueprint.config.mjs` — instead of a config edit plus an install plus a second pass over this merge, months later, by someone who was not here.',
    '     Then resolve every rule conflict *explicitly* — house disable conventions, thresholds, rules an existing structure tool already enforces — and note each decision in the report.',
    '     **`codeStyle` means blueprint\'s emitted config formats this repo**, so a repo that already runs its own formatter is the overlapping-tool case above: keep ONE owner of formatting, and say which in the report.',
    '     Rules configured under the same key on both sides (`@stylistic/*`, `padding-line-between-statements`) collide mechanically — flat config replaces rather than merges — so those are a wiring precondition, not a preference.',
    '     Before merging, run `npx blueprint impact`: it lints the layer files with only the emitted config and reports hits per rule, so every conflict is decided on numbers, not by reading the emitted config against the code.',
    '     Mind flat-config semantics while merging: when two entries configure the same rule, the later entry *replaces* the earlier **on the files both of them match** — nothing merges, and ordering alone cannot save a rule **both sides set** (`no-restricted-imports`, `no-restricted-syntax`): whichever comes later silently deletes the other\'s defense there while lint stays green.',
    '     That qualifier is the whole merge rather than a detail of it: an entry does nothing at all to a file outside its own `files`, so the spread goes on enforcing blueprint\'s entry everywhere yours does not reach, and only the overlap has to be combined.',
    '     Combine both option sets into ONE entry — blueprint\'s patterns and selectors plus your own (`npx blueprint rules --json` carries the exact selfOnly selectors per layer as `jsLiteral` — paste that field, quotes included, never an emitLint dump. Its `note` says why the rendered `selectors` value is not the same string once it is inside JS source; that is a silent break, so take the field that survives the paste rather than the one that reads more naturally).',
    '',
    renderCombinedEntry(),

    renderTestExemptions(),
  ].join('\n');
}

/**
 * Step 9's debt posture: keep severity at `error` and ratchet, never mute. Earns a
 * name for the exception it carries — `codeStyle` and `statementPadding` are
 * nearly all auto-fixable, so they are fixed rather than ledgered, and that fix is
 * its own commit because it rewrites whitespace across every layer file.
 */
function renderRatchet(): string {
  return [
    '   - **Red is correct — ratchet it, don\'t mute it.** Keep severity at `error`; adoption\'s job is to make debt visible and lock it, not to quiet the screen.',
    '     Lock each side in its native ledger: architecture findings via `npx blueprint inspect --update-baseline`, lint violations via `npx eslint . --suppress-all` (`impact` already told you the count — zero hits means SKIP this command, with one carve-out: the anti-bypass guard sits OUTSIDE impact\'s scope, so bare disables it flags in YOUR lint run are real findings — judge them: annotating the disable with its reason is a comment edit, not a source refactor, so it sits INSIDE this pass\'s boundary; the ledger takes whatever you choose to leave, and the report says which you did; ESLint ≥ 9.24 — counts per file × rule, so NEW violations still fail).',
    '     **The formatting family is the exception to "ledger it, don\'t fix it":** `codeStyle` and `statementPadding` are nearly all auto-fixable, so `eslint --fix` resolves them outright and suppressing them would ledger a reformat nobody needs to review.',
    '     Run that fix as its OWN commit, touching nothing else, and say so in the report — it rewrites whitespace across every layer file *including tests* (the shape rules are the one gate family tests are NOT exempt from), and a diff that size folded into an architecture commit is unreviewable.',
    '     It cannot make another gate worse: `maxLines` skips blank lines, so the added lines are free.',
    '     What `--fix` does NOT resolve is worth naming, because those are the real findings: `max-len` has no fixer (a long line must actually be restructured — and it does not exempt plain strings, so a string cannot hide one), and a `linebreak-style` red usually means git\'s `autocrlf` / `.gitattributes`, NOT the file — fix it there or the next checkout undoes you.',
    '     Your gate then blocks only new debt on both, and `blueprint doctor` verifies neither ledger has gone stale.',
    '     The inverse is equally correct: **zero findings and zero lint hits is a complete outcome** — the ledgers simply stay absent (`inspect --baseline` — identical without a ledger — and the project\'s own lint are the gates), and manufacturing debt just to demo the ratchet is mistranslation, not adoption.',
    '     That includes `--suppress-all`: on a clean lint it writes an EMPTY `eslint-suppressions.json`, and an empty ledger is ceremony — skip the command when there are no hits, and delete the file if one slipped out (`doctor` says so too).',
    '     Still on ESLint 8 / a legacy config?',
    '     Transitional fallback: `emit: { lint: { severity: \'warn\' } }` — but state the cost in the report: severity only covers the structural rules, so until the migration, new metric debt (maxLines…) is not gated.',
  ].join('\n');
}

/**
 * Step 9's overlapping-tool decision. Earns a name for the one case where
 * consolidation stops being the owner's scope decision and becomes a wiring
 * precondition: when the existing tool configures the SAME ESLint rules emitLint
 * emits, coexistence is mechanically impossible and doctor's survival check fails.
 */
function renderOverlappingTool(): string {
  return [
    '   - **If the repo already runs an overlapping structure tool** (e.g. structure-lint, dependency-cruiser), say so in the report: blueprint\'s lint layer duplicates it, and consolidating onto one gate is a scope decision for the user — flag it, don\'t decide it.',
    '     **Exception:** when the existing tool configures the *same ESLint rules* emitLint emits (`no-restricted-imports`, `no-restricted-syntax`), coexistence is mechanically impossible — the entries overwrite each other and doctor\'s survival check fails.',
    '     There, consolidation stops being a scope decision and becomes a wiring precondition; do it, and name which gate won in the report.',
    '     The inverse case — a house rule under a DIFFERENT key with the same semantics (a hand-rolled deep-watch or test-filename twin) — never collides mechanically; it double-reports instead.',
    '     Keep ONE gate per semantic (the house rule\'s docs footprint usually decides which) and record the choice — declaring blueprint\'s twin on top is noise, not safety.',
    '     The same rule spans gate LAYERS: a house `import/no-cycle` (lint) and the `cycles` gate (inspect) are one semantic — pick one detector and record it (the catalog\'s perf note usually argues for the inspect side).',
    '     **But across gate layers the deciding axis is WHEN the failure appears, not perf**, and that is the difference between deciding and flagging.',
    '     Two lint rules for one semantic are a pure duplicate: drop one, no one\'s workflow changes.',
    '     Dropping a lint-time detector in favour of `cycles` moves the interception from wherever lint runs — pre-commit hook, editor, CI step — to the `inspect` gate, which may not be wired into any of them yet.',
    '     That is the adopter\'s pipeline, so declare blueprint\'s gate only if you are also placing `inspect` where the lint rule used to fire; otherwise leave the existing detector alone and put the consolidation in the report as a recommendation with that cost named.',
    '     Two field runs reached this conclusion by deriving it.',
    '     And when a tool IS retired, retire it whole: DELETE its config file — a stale architecture config sitting beside blueprint.config.mjs misleads worse than any prose pointer — then sweep the footprint in the same pass: grep the repo for its name (docs, README, code comments, agent skills and commands all go stale the moment the config is deleted) and update or remove every pointer you find.',
    '     A dependency entry leaves via the package manager, not a text edit; source-code comments referencing the dead tool may outlive the sweep under this playbook\'s no-source-edits boundary — list them in the report instead of editing them.',
  ].join('\n');
}

/**
 * Method step 9 — "Finish means integrated, not parked".
 *
 * A step by numbering only: steps 1-8 run one to five lines each, this one runs
 * 237, and it is the passage field findings land in because integration is where
 * adoption actually fails. Still emitted inside the numbered list, so the document
 * is unchanged — the split is so the growth has somewhere named to land. Ten lines
 * added to `renderLintMerge` read as "the merge guidance grew again"; the same ten
 * lines in an unnamed middle of a 334-line `renderMethod` read as nothing.
 *
 * The three short bullets stay inline: a bold lead-in of four to twelve lines is
 * already its own address, and a function per line would be noise.
 */
function renderFinishStep(claudeDir: ClaudeDirState): string {
  return [
    `9. **Finish — and finish means integrated, not parked.** Run \`npx blueprint init\`, then \`npx blueprint inspect --update-baseline\`, write the report, and delete ${cleanupTargets(claudeDir)} The tool never touches files you own, so it leaves \`*.blueprint.*\` references next to them — **those references are your input, not the deliverable.`,
    `   Adoption is not done while any reference file remains:**`,
    '   - **Declare your own tool** in the config — `emit: { agents: [\'claude\'] }` (Claude Code) or `[\'agents\']` (codex & friends) — so init generates one contract file, not one per tool nobody uses.',
    '     Declare the tool RUNNING this adoption — you know who you are; never guess at future tools (the next one is a one-line config change away).',
    '     On a preset config, pass it straight in: `reactPreset({ name, emit: { agents: [\'claude\'] } })` — and `init --agent claude` on the preset path scaffolds the config with this already declared, so flag and config end up saying the same thing.',
    renderLintMerge(),
    renderRatchet(),
    '   - **If a hand-written CLAUDE.md / AGENTS.md exists**, integrate the `<name>.blueprint.md` reference into the existing document following *its* structure — link, don\'t duplicate; keep project facts to one screen — then delete the reference.',
    renderOverlappingTool(),
    '   - **Everything the adoption produced is meant to be committed** — the config, the generated artifacts, and both ledgers (`.blueprint-baseline.json`, `eslint-suppressions.json`): the gates read the ledgers from the repo, so an uncommitted baseline is a ratchet that only works on your machine.',
    '     Not a VCS repo (or you lack commit rights)?',
    '     Leave the files in place and say so in the report — never initialize version control on the owner\'s behalf.',
    '     The same boundary covers ongoing enforcement: blueprint deliberately scaffolds no CI — the gate commands (`npx blueprint inspect --baseline`, `npx blueprint doctor`) are the deliverable, and wiring them into a pipeline or git hook is the owner\'s call.',
    '     Recommend it in the report; never add pipeline config yourself.',
  ].join('\n');
}

/**
 * Method step 1 — 65 of the Method's 94 lines, and a section wearing a list
 * item's number for the same reason step 9 is: it carries the whole re-adoption
 * problem. An architecture doc already in the repo is intent evidence senior to
 * the import matrix, EXCEPT when it is blueprint's own prior output, and the
 * clauses a matrix cannot see (named-import ownership, selfOnly shape, an empty
 * runway layer's position) have to be reproduced from it or a "faithful"
 * re-adoption hands back a looser config than it replaced.
 */
function renderIntentDocuments(): string {
  return [
    '1. **Look for existing intent documents first.** An architecture config or doc already in the repo (`structure.config.json`, dependency-cruiser rules, `docs/architecture*`, `CLAUDE.md`/`AGENTS.md` sections, ADRs) is intent evidence *senior* to the import matrix: the matrix shows what the code *does*, those documents say what it *should* do.',
    '   They also carry what the matrix cannot — the position of empty (zero-file) layers, selfOnly-style constraints, and ownership rules.',
    '   Translate them; use the matrix to verify.',
    '   (One token trap: structure-lint\'s `{folder}` placeholder is blueprint\'s `{layer}` in `layerFiles`.) One document family is NOT senior evidence: blueprint\'s own prior output.',
    '   A `docs/architecture-handbook.md` it generated, and any `BLUEPRINT:START` marker block in `CLAUDE.md`/`AGENTS.md`, are a previous answer to this same question — re-adopting a repo blueprint has already adopted, they will hand you back the old config almost verbatim.',
    '   Read them as an answer to CHECK, never as intent to translate: derive the flow from the matrix independently first, then compare.',
    '   Agreeing is the good outcome (that is idempotency); agreeing because you copied is how a mistranslation from the first pass becomes permanent.',
    '   One exception, and it decides the harder cases: some clauses **cannot** be derived from the matrix at all — ownership of a named import, the shape of a selfOnly narrowing, the position of a layer holding no files, a permitted importer with zero edges today.',
    '   **And the rule that catches the rest: any field in the prior config that the schema sketch below does not show.** The sketch is a starting shape, not the field list — `sourceRoot`, `layerFilesIgnore`, `naming`, a layer\'s `mustNot` and `lintOverrides`, `principles`, `componentShape`, `playbook` are all valid, all invisible to a survey, and every one of them changes what gets emitted.',
    '   They are the easiest of the set to lose because losing them costs no error: the contract comes back shorter, an override stops being emitted, an ignore stops being applied.',
    '   `sourceRoot` is the one that does real damage — drop it on a repo whose code is not under `src/` and every layer glob silently points at nothing.',
    '   Diff the prior config against yours field by field before you believe you reproduced it.',
    '   For those the prior output is the only evidence there is, so check-only means dropping them, and a "faithful" re-adoption then hands back a config LOOSER than the one it replaced.',
    '   Verify each against what the matrix CAN see (is there an edge for this importer? is the owned package imported only there?), reproduce it when that checks out, and list in your report which clauses were reproduced rather than derived.',
    '   **A named import has its own evidence, and it is not the package row**: the survey lists every specifier that appears in exactly one folder, from a package that appears in several — `owns: [{ package: \'react\', imports: [\'createContext\'] }]` is CONFIRMED when the pair is on that list, which the package row can never do for it.',
    '   Absent from that list it is not refuted, and absence is never a licence to drop it: the specifier may be imported nowhere yet (a forward-looking ban, like the permitted importer with no edges), its package may sit in one folder already (the package row covers it), or several folders may import it — and that last one is existing debt for the baseline to record, not a clause to delete.',
    '   Regressing a gate the owner already committed is the worse error.',
    '   One more thing about re-adoption, so you do not spend a cycle proving it: the artifacts init regenerates — the contract block, the handbook — can come out WORDED differently from the ones committed whenever a different BUILD wrote them.',
    '   Equal version strings do not rule that out: an unreleased tree, a linked checkout and a git dependency each report the last release while emitting later text.',
    '   That is the improvement arriving, not drift and not non-idempotency, and the check is the same either way — re-run init twice and the second run is byte-identical to the first.',
    '   Take the new wording and say in your report that it changed.',
    '   Never hand-revert generated text toward what git happens to hold.',
    '   Documents also go stale: cross-check every translated clause against the survey below.',
    '   Where they disagree, the document governs *intent* (layer order, ownership) and the code governs *shape* (module layout) — downgrade the stale clause and record the conflict in your report.',
    '   Flow documents often draw a DAG; blueprint\'s order is linear (a layer may import *any* later layer).',
    '   Linearize, then verify against the matrix — linear is transitive, so it is usually a strict relaxation, not a real change.',
    '   Downgrading a clause leaves that drawing disagreeing with the config you just wrote.',
    '   Leave it disagreeing: a hand-written document is the repo\'s, not adoption\'s to edit, and redrawing one is a doc reconcile no one asked for.',
    '   Name the specific edge or box that no longer matches, in the report, so the owner can settle it in one pass.',
    '   Several positions equally legal (no matrix edges either way — empty layers especially)?',
    '   Pick the one granting the fewest new import permissions: the smallest relaxation.',
  ].join('\n');
}

/**
 * The nine steps, and the largest section by far — step 9 alone carries the
 * whole integration boundary, because "finish" is where adoption gets parked:
 * the tool declaration, the lint merge and its flat-config traps, the ratchet
 * posture, the overlapping-tool decision, and what must be committed.
 *
 * `claudeDir` reaches here for step 9's cleanup, which names the same targets
 * the early-exit checklist does — see `cleanupTargets`.
 */
export function renderMethod(claudeDir: ClaudeDirState): string {
  return [
    '',
    '## Method',
    '',
    renderIntentDocuments(),
    '2. **Study the survey evidence below.** Every number is deterministic fact from this repo; do not re-derive it by grepping.',
    '3. **Decide what is a layer.** Top-level folders under `src/` are candidates; root files are app wiring (never a layer).',
    '   Test plumbing (`test/`, `__tests__/`) belongs in `testFiles`, not in `layers`.',
    '   A folder that exists but holds no source files usually signals declared intent — check the documents from step 1 before dropping it.',
    '4. **Infer the one-way flow.** Order layers so the *majority* direction of the import matrix points downward.',
    '   Counter-edges are debt to surface, not intent to encode — never contort the order to make findings zero.',
    '5. **Choose module shape per layer.** High `index`-coverage child folders → `module: { layout: \'folder\', entry: \'index\' }` on that layer; plain files → the flat default (omit `module` entirely — it validates and resolves to `{ layout: \'flat\', entry: \'index\' }`).',
    '   Mixed repos usually need per-layer overrides.',
    '6. **Assign ownership.** A package imported by exactly one folder (see the concentration list) is an `owns` candidate for that layer.',
    '   A candidate the intent documents never mention is a proposal, not intent — leave it out of the config and name it in the report; encoding it is tightening beyond what the repo declared.',
    '7. **Write the config** with `defineBlueprint` (schema sketch below).',
    '8. **Validate — the loop that keeps you honest.** Run `npx blueprint inspect`.',
    '   A findings explosion (roughly more findings than source files, or one dominant rule everywhere) means you mistranslated intent — revisit the order or the module shapes.',
    '   Converged means: every finding is explainable as real, nameable debt.',
    renderFinishStep(claudeDir),
  ].join('\n');
}

/**
 * Facts about the emitted rules that drive authoring decisions. Stated here for
 * one reason: an agent that cannot find them reverse-engineers them from the
 * package's `dist/` bundle, which the playbook forbids a few sections up.
 */
export function renderSemantics(): string {
  return [
    '',
    '## Semantics the linter holds you to',
    '',
    'Facts about the emitted rules that drive authoring decisions — stated here so you never have to reverse-engineer them from the bundle:',
    '',
    '- **Flat layout:** the module is the whole layer, so same-layer *relative* imports are always legal.',
    '  The alias is for crossing layers — a same-layer import through the alias becomes an error the moment the lint is wired.',
    '- **Folder layout:** a module is one child folder with private internals.',
    '  *Same-layer* sibling modules must not import each other at all — via the alias or `../` alike; the shared part wants to live in a lower layer.',
    '  Only *lower-layer* folder modules are importable, and entry-only; `../` escapes are caught at any depth by `blueprint/relative-escape`.',
    '- **Pre-wiring check:** the survey\'s "Same-folder imports via the alias" count is an upper bound on the errors the wiring will introduce, not the exact number — it is a textual count that includes test files (exempt in the emitted config) and non-static references (dynamic imports, mock specifiers, doc comments) the wired rules may never flag.',
    '  Treat non-zero as "look here"; once the config exists, `npx blueprint impact` reports the real per-rule count.',
    '  The fix for true hits is layout-dependent — flat: rewrite them as relative imports; folder: extract the shared code downward (a relative rewrite just trades the error for `relative-escape`).',
    '  Whatever stays unresolved lands in the suppressions ledger.',
    '- **`unusedVars`** emits with `argsIgnorePattern: \'^_\'` and nothing else: `_`-prefixed *arguments* are exempt; unused variables and catch parameters are not.',
    '- **`doctor`\'s "eslint wired" check** passes when the eslint config\'s text references `@kekkai/blueprint` (or the config is the generated file itself).',
    '- **`doctor`\'s leftover check matches exact file families** — this playbook, the command file, `*.blueprint.*` references, and marker-bearing contracts outside `emit.agents` — never other files, whatever their names.',
    '  A report or feedback file you were asked to write is safe without a verification re-run.',
    '- **`doctor` prints `⊘` for a check it could not run** and never counts it as a pass: the banner reads "Adoption unverified — N of M checks passed, K could not run".',
    '  Exit stays 0, because a skip is not a failure — so an exit-code gate cannot see one, and `--json` carries `skipped` with the reason.',
    '  The check that skips is `emitted rules survive the merged eslint config`, in two states: eslint is not wired (the wiring check above is the red for that), or the merged config would not resolve, leaving nothing to compare the emitted rules against.',
    '- **Test files are EXEMPT** — `architecture.testFiles` (default `*.test.* / *.spec.*`) sit outside the structural rules and `inspect` alike.',
    '  If the tool you are replacing policed tests too, switching to blueprint deliberately RELAXES that enforcement — say so in the report instead of letting the difference pass silently.',
  ].join('\n');
}

/**
 * The rule catalog, generated from the same exported gate tables `emitLint` and
 * `blueprint rules` read — so the playbook cannot drift from what is emitted.
 * The one section here whose body is computed rather than written.
 */
export function renderRuleCatalog(): string {
  return [
    '',
    '## Rule catalog — ask this file, not the bundle',
    '',
    '(The same catalog is queryable anytime: `npx blueprint rules` — annotated with the config\'s declared tiers once one exists.)',
    '',
    '**Structural rules — always emitted**, whatever the `rules` block says.',
    'Their shared severity is `emit.lint.severity` (default `error`), and that knob covers ONLY these:',
    '',
    '- `no-restricted-imports` per layer — dependency flow, same-layer bans, package ownership at whole-package OR named-import granularity (`owns: [{ package: \'vue\', imports: [\'inject\'] }]` bans that named import outside the owning layer; same-signature entries merge into one rule allowing every declaring layer), fixture bans.',
    '  `additionalAliases` join every structural ban alongside the main alias — with their target\'s offset baked in (`\'~root\': \'.\'` bans `~root/src/views/**`); an alias into a subfolder has no layer surface, so it carries no layer bans.',
    '- `no-restricted-syntax` — re-export bans for `selfOnly` importers, emitted ONLY when an allowedImporters ENTRY declares it (`allowedImporters: [{ layer: \'views\', selfOnly: true }]` — a layer-level `selfOnly` key is invalid and validation rejects it) — no selfOnly, no syntax rule to collide with your own `no-restricted-syntax`.',
    '  `blueprint rules` annotates whether THIS config emits it — never probe emitLint to find out.',
    '- `no-restricted-globals` — global ownership (e.g. `{ global: \'fetch\' }`)',
    '- `blueprint/relative-escape` — depth-aware `../` module escapes (embedded plugin; ships inside the emitted config)',
    '',
    '**Optional gates — emitted only when declared** in `rules` with a tier other than `off`; none of these emits by default, and every gate scopes to the layer file globs — root wiring sits outside all of them.',
    'When merging, collisions are decided by rule KEY, not by hit count — `blueprint rules --json` names every key the emitted config sets, and carries the exact selfOnly selector strings a fold needs.',
    'Adoption stance for these gates: declare one only to translate an existing house threshold (carry its value); switching NEW gates on is the owner\'s later tuning, not the adopting agent\'s call.',
    'Carrying a value is the OBJECT form of a rule setting — `maxLines: { tier: \'error\', value: 1200 }`, never a tier/value array; `tier` is required in that form, so the object without it is rejected by name at config load rather than emitting a tierless rule.',
    'The metric family falls back to these thresholds when no `value` is given:',
    '',
    `${METRIC_GATES.map((gate) => `- \`${gate.id}\` → \`${gate.rule}\` (default ${gate.fallback})`).join('\n')}`,
    `${PLUGIN_GATES.map((gate) => `- \`${gate.id}\` → \`${gate.emits}\` — ${gate.note}`).join('\n')}`,
    '',
    '**Documentation-only ids — never an ESLint line:**',
    '',
    `${DOC_ONLY_RULES.map((entry) => `- \`${entry.id}\` — ${entry.note}`).join('\n')}`,
  ].join('\n');
}

/**
 * A commented `defineBlueprint` sketch. Deliberately a sketch and not the field
 * list: the re-adoption step tells an agent to reproduce any field the sketch
 * does not show, so this staying incomplete is load-bearing, not an omission.
 */
export function renderSchemaSketch(): string {
  return [
    '',
    '## Config schema sketch',
    '',
    '```js',
    'import { defineBlueprint } from \'@kekkai/blueprint\';',
    '',
    'export default defineBlueprint({',
    '  name: \'<project>\',',
    '  framework: \'<vue|react>\',',
    '  architecture: {',
    '    // Preset default is \'~app\' ON PURPOSE: \'@\' is npm\'s scope sigil',
    '    // (@vue/*, @types/*) — an app alias that does not look like a package',
    '    // scope stays visually distinct. Override only to match an existing',
    '    // team convention, not for taste.',
    '    alias: \'<alias>\',',
    '    // Extra import roots beyond the alias. One whose target can contain',
    '    // the layer folders (the source root, or above it — \'~root\': \'.\')',
    '    // joins every structural ban with the offset baked in; a subfolder',
    '    // alias like this one has no layer surface and carries no layer bans.',
    '    additionalAliases: { \'~shared\': \'./src/shared\' },',
    '    layers: [',
    '      // Order defines the one-way flow: a layer may import only layers',
    '      // declared AFTER it. allowedImporters (optional) narrows who may',
    '      // import a layer; selfOnly = depend on it but never re-export it.',
    '      { name: \'pages\', does: \'<one-line responsibility>\' },',
    '      {',
    '        name: \'features\',',
    '        does: \'…\',',
    '        module: { layout: \'folder\', entry: \'index\' }, // per-layer override',
    '      },',
    '      // owns entries — the full shape (nothing else lives only in dist).',
    '      // A package several layers may use: declare the SAME entry in each of',
    '      // them — same-signature owns merge into one rule allowing every',
    '      // declaring layer; the repetition IS the shared-allowance syntax.',
    '      //   \'axios\'                                    whole package',
    '      //   { package: \'vue\', imports: [\'inject\'] }    named imports only',
    '      //   { package: \'@scope/*\', pattern: true }     glob over import',
    '      //     specifiers — npm scopes and alias paths (\'~app/services/http*\') alike',
    '      //   { package: \'x\', exempt: [\'**/*.stories.*\'] }  files exempt from the ban',
    '      //   { global: \'fetch\' }                        global identifier',
    '      { name: \'services\', does: \'…\', owns: [\'axios\', { global: \'fetch\' }] },',
    '    ],',
    '    // Optional — omitting module (or any of its keys) IS the flat default',
    '    // ({ layout: \'flat\', entry: \'index\' }); private: [\'hooks\', …] keeps',
    '    // parts behind the entry.',
    '    module: { layout: \'flat\', entry: \'index\' },',
    '    layerFiles: \'src/{layer}/**/*.<ext glob>\',',
    '    testFiles: [\'**/*.test.*\', \'**/__tests__/**\'],',
    '  },',
    '  // A bare tier takes the gate\'s default threshold. To carry an existing',
    '  // house threshold instead, use the object form — `tier` required, `value`',
    '  // optional: `maxLines: { tier: \'error\', value: 1200 }`. Shown here as a',
    '  // comment ON PURPOSE: declaring a gate you are not translating is the',
    '  // owner\'s tuning, so this line stays two gates that a preset sets too —',
    '  // NOT the set a preset sets, which is nearly the whole catalog.',
    '  // `npx blueprint rules` prints that set, and which of them are active.',
    '  rules: { cycles: \'error\', unusedVars: \'error\' },',
    '});',
    '```',
  ].join('\n');
}

/**
 * The six checkboxes that define done — `doctor` last, since it flags this file.
 * The cleanup box names the directories too: a checkbox is the definition an
 * agent verifies itself against, so a target missing here is a target left
 * behind by anyone who works from this list.
 */
export function renderAcceptanceGates(claudeDir: ClaudeDirState): string {
  return [
    '',
    '## Acceptance gates',
    '',
    '- [ ] `npx blueprint inspect` findings are all explainable as real debt',
    '- [ ] `npx blueprint inspect --baseline` exits 0 — ledger locked when debt exists, correctly absent when it does not',
    '- [ ] The blueprint lint rules run inside the project\'s own lint command (merged, conflicts resolved) — or the legacy-config migration is a named decision item in the report',
    '- [ ] No `*.blueprint.*` reference file remains in the repo',
    '- [ ] The report names every import cycle and every upward dependency found',
    `- [ ] Deleted: ${cleanupTargets(claudeDir)} THEN \`npx blueprint doctor\` passes with no \`⊘\` — a skip is not a pass and keeps exit 0 — doctor flags them as leftovers, so it is the last thing you run, not a mid-flow smoke test`,
  ].join('\n');
}

/**
 * What survives an interrupted run. `inspect` is read-only, `init` idempotent,
 * and the baseline is written only at the final step, so stopping costs nothing
 * — worth saying, because an agent that fears a half-done state hands back.
 */
export function renderResumePoint(): string {
  return [
    '',
    '## If you stop midway',
    '',
    'Nothing is lost.',
    'This playbook and the survey stay on disk; `inspect` is read-only, `init` is idempotent, and the baseline is only written at the final step.',
    'A human (or another agent) resumes from the same loop.',
  ].join('\n');
}

/**
 * The survey, fenced. Every number is deterministic fact about this repo, which
 * is why the Method tells the agent not to re-derive any of it by grepping.
 */
export function renderSurveyEvidence(survey: SurveyResult): string {
  return [
    '',
    '## Survey evidence',
    '',
    '```',
    `${renderSurvey(survey)}`,
    '```',
    '',
  ].join('\n');
}
