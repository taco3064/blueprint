import type {
  ClaudeDirState,
  PackageManager,
  TscArtifactLocation,
  ViteTsCoverage,
} from '../project';
import type { SurveyResult } from '../survey';
import { scriptCommand } from './plan';
import { BROWNFIELD_MIN_FILES, cleanupTargets, printConfigCaveats } from './playbook';

/**
 * The early-exit verdict, and only below the brownfield threshold — it LEADS the
 * playbook, carrying the complete checklist, so a hurried agent cannot walk the
 * ceremony past it. Everything here is rendered by that one section.
 */

/**
 * Which build to run, from a measured fact rather than a per-repo instruction —
 * `viteTsCoverage` reads the tsconfig graph. `null` is the honest third case, and
 * there "go and look" stands, because it is exactly right when the tool could not.
 */
function renderBuildChoice(viteTs: ViteTsCoverage | null, pm: PackageManager): string[] {
  const shared = [
    '   Never report that a build verified the vite edit without having established that the build '
    + 'reads the vite config: that claim is the one thing this step can get silently wrong, '
    + 'and `tsc -b` exiting 0 is not evidence for it.',
  ];

  if (viteTs === null) {
    return [
      '   **Which build, though — and where `tsc -b` is enough, '
      + 'prefer it.** It answers the only question available here without emitting a bundle into '
      + 'a tree that may have nowhere to put one (see below).',
      '   **Whether `tsc -b` covers your vite edit is a fact about THIS repo, '
      + 'and this run could not settle it — read it, do not assume it.** Templates differ: '
      + 'many put `vite.config.ts` inside a tsconfig project (commonly a `tsconfig.node.json` '
      + 'reached through `references`), and there `tsc -b` type-checks the vite edit too; '
      + 'others leave a single root config at `include: ["src"]`, '
      + 'and there `tsc -b` never reads the file you just edited — '
      + 'it exits 0 whatever you put in it.',
      '   Open the tsconfig(s) and see which one you have.',
      '   Inside a project, `tsc -b` is the build to prefer here.',
      '   Outside every project — or once layer files exercise the alias — '
      + 'run `npx tsc -b` and then the vite build separately: '
      + 'together they cover what the full build covers, '
      + 'and only the split lets you say which edit each one verified.',
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
 * The early-exit verdict, and only below the threshold — it LEADS there, carrying
 * the complete checklist, so a hurried agent cannot walk the ceremony past it.
 */
/**
 * What the build leaves behind and who owns it. `tsc -b` writes a
 * `*.tsbuildinfo` even under `noEmit`, so the early exit's verification step
 * produces untracked files in someone's working tree — a step THIS playbook asked
 * for, which is why it has to say so rather than leave a mess unexplained.
 *
 * The lead-in belongs to the first line, not the call site: as its own element the
 * `\n` join would split the sentence across two lines and make it ungreppable.
 */
function renderBuildArtifacts(tscOut: TscArtifactLocation | null): string {
  // Only the certain negative specialises: `npm create vite` pairs `noEmit` with a
  // `tsBuildInfoFile` under `node_modules/`, so the wording below would name
  // untracked files that do not exist (field run #135).
  if (tscOut !== null) {
    return [
      `   **\`tsc -b\` leaves nothing in this working tree, and that is measured.** \`${tscOut.tsconfig}\` sets \`noEmit\` and sends the build info to \`${tscOut.buildInfo}\`, which is out of the way by convention — so the build you just ran produced no untracked file here to decide about.`,
      '   The four cells below still decide the bundle, and only if you ran the vite build: '
      + 'that one does write into the tree.',
      '   Ran only `tsc -b`? Then the tree is as you found it, '
      + 'and the report says that rather than picking a cell — '
      + 'saying "I removed the artifacts" when none existed is the same wrong sentence as '
      + 'leaving a mess unexplained.',
      ...renderArtifactCells(),
    ].join('\n');
  }

  return [
    '   Its artifacts (`dist/`, `*.tsbuildinfo`) are the build\'s normal output, and '
    + '**`tsc -b` writes a `*.tsbuildinfo` even under `noEmit: true`** — '
    + 'build mode\'s book-keeping of what it already checked, not emitted program output, '
    + 'so the two settings do not conflict and the file is safe to delete.',
    '   Stated because the opposite reading is the natural one: '
    + 'an agent that just opened the tsconfig to answer the paragraph above has `noEmit: '
    + 'true` in front of it, and a file appearing anyway looks like the build overriding the '
    + 'config.',
    '   Where it lands is the repo\'s call: a `tsBuildInfoFile` pointing under `node_modules/` '
    + 'keeps it out of the tree entirely, and this run could not establish that either way.',
    ...renderArtifactCells(),
  ].join('\n');
}

/**
 * The four cells, shared by both arms above — two copies of a four-way decision is
 * how a cell goes missing from one of them.
 */
function renderArtifactCells(): string[] {
  return [
    '   Either way they are not adoption leftovers: leave them to the repo\'s own ignore rules, '
    + 'and say so in the report instead of guessing a cleanup when those rules will not cover '
    + 'it.',
    '   Two independent facts decide that, not one — whether the repo HAS ignore rules, '
    + 'and whether it is under version control at all — and a repo can be any combination.',
    '   A `.gitignore` listing `dist` in a tree that is not a git repo is a rule with nothing to '
    + 'enforce it; no `.gitignore` under git means the artifacts show up in `git status`; '
    + 'neither means "untracked" describes every file in the tree and the word stops '
    + 'distinguishing anything.',
    '   Say which of the four you are in — it is one sentence, '
    + 'and it is the difference between a report the owner can act on and one they have to '
    + 're-derive.',
    '   Say it as what it is — a step THIS playbook asked for produced untracked files in '
    + 'someone\'s working tree — and say that deleting them is safe, '
    + 'because nothing adoption wrote depends on them and the build can be re-run.',
    '   Then it is the owner\'s call rather than an unexplained mess: '
    + '"leave them" without that sentence reads as "you may not touch these", '
    + 'which is not what it means.',
  ];
}

/**
 * The artifact hand-over, as three rules rather than a four-cell table — the table
 * left one cell undecided and three field runs called it a coin flip.
 */
function renderArtifactHandover(): string {
  return [
    '   **One of the four cells decides itself: no ignore rules AND no version control.** There, '
    + '"leave them to the repo\'s own ignore rules" names rules that do not exist and an owner '
    + 'who has no `git status` to see them in — '
    + 'so remove what your own verification step created, and say you did.',
    '   That is not the owner\'s call being taken from them: '
    + 'it is the same reason this path prefers `tsc -b`, applied one step later.',
    '   The tree you hand back is the tree you were given.',
    '   In the other three cells leave the artifacts alone: `git status` surfaces them, '
    + 'or an ignore rule names them, and either way something other than your report is keeping '
    + 'track.',
    '   **An ignore rule with no git behind it still counts as the second kind, '
    + 'and the distinction is declared against enforced.** A `.gitignore` listing `dist` in a '
    + 'tree that is not a git repo enforces nothing today — said plainly above — '
    + 'and it is still the repo author writing down that this artifact is disposable, '
    + 'which takes effect the moment anyone runs `git init`.',
    '   That declaration is what you leave the artifact on.',
    '   The cell that decides itself is the one with no declaration anywhere: '
    + 'no rule to go dormant, no history to surface it, nothing but your report.',
    '   Read those two sentences together or they read as a contradiction — '
    + 'enforced today is not the test; declared at all is.',
    '   **"Your own verification step" is narrower than "untracked", '
    + 'and in this cell nothing else marks the difference.** Three kinds of file end up '
    + 'untracked here and only the first is yours to remove: '
    + 'what a verification command produced (`dist/`, `*.tsbuildinfo` — remove); '
    + 'what `init` produced, including the install (`node_modules/`, '
    + 'a written or rewritten lockfile, the config, the emitted contract and handbook — '
    + 'these are the adoption, keep every one); '
    + 'and whatever was already in the tree before you started, '
    + 'blueprint\'s or not (leave untouched, and do not report it as adoption\'s).',
    '   Deciding this by "is it untracked?" deletes the deliverable; '
    + 'deciding it by "did I run the command that made it?" does not.',
  ].join('\n');
}

/**
 * The early exit's verification step — one numbered item that is really a section,
 * long because a green lint and build on a near-empty repo prove less than they
 * look like they prove. `viteTs` is here so the build choice is answered from the
 * repo rather than asserted about it.
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
  if (survey.totalFiles >= BROWNFIELD_MIN_FILES) {
    return '';
  }

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
    '1. `npx blueprint init --preset --agent claude` (or `--agent codex`) — '
    + 'scaffolds config + artifacts with YOUR contract declared: '
    + 'the flag persists into `emit.agents`, so one run emits one contract file.',
    '   Running as neither tool?',
    '   Plain `--preset`, then declare `emit.agents` in the config and re-run init.',
    '2. `npx blueprint impact` (0 hits → skip `--suppress-all` entirely; '
    + 'an empty suppressions ledger is ceremony) and `npx blueprint inspect --baseline` — '
    + 'both exit 0. (`--update-baseline` is deliberately not on this list: '
    + 'with zero debt it is a no-op that writes nothing — '
    + 'the full method runs it because brownfield repos have debt to lock; '
    + 'a clean early exit has none.)',
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
