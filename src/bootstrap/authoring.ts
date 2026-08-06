import { AUTHORING_FILE, COMMAND_FILE } from '../project';
import type {
  ClaudeDirState,
  PackageManager,
  TscArtifactLocation,
  ViteTsCoverage,
} from '../project';
import type { SurveyResult } from '../survey';
import { installCommand } from './plan';
import {
  renderAcceptanceGates,
  renderGoal,
  renderHeader,
  renderMethod,
  renderNextNote,
  renderPrerequisites,
  renderResumePoint,
  renderRuleCatalog,
  renderSchemaSketch,
  renderSemantics,
  renderSurveyEvidence,
  renderVerdict,
} from './playbook';
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

// The threshold lives with the verdict that reads it; re-exported because
// bootstrap and the CLI both quote it, and they know this module, not playbook.
export { BROWNFIELD_MIN_FILES } from './playbook';

/** The entry prompt every launcher (or human) feeds the agent. */
export const AGENT_PROMPT
  = `Read ${AUTHORING_FILE} at the repository root and execute it end to end.`;

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
  claudeDir: ClaudeDirState;
  /** Measured `tsc -b` coverage of the vite config; null when undecidable. */
  viteTs: ViteTsCoverage | null;
  /**
   * Measured: where `tsc -b` keeps its build info when it provably writes nothing
   * into the working tree. Null unless certain — the artifact paragraph assumes
   * artifacts, which is right everywhere this cannot say otherwise.
   */
  tscOut: TscArtifactLocation | null;
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

/**
 * The playbook: goal, method, acceptance gates, and the survey evidence.
 *
 * The assembly only — every section's text lives in `playbook.ts`, one function
 * each, so this reads as the emitted document's table of contents.
 */
export function authoringBrief(
  survey: SurveyResult,
  install: string,
  // An options object, not two positional booleans. `claudeDir` is required and
  // `next` has a default, so positionally every caller had to state `next` in order
  // to reach the field after it — which silently retired `next`'s default and the
  // only thing exercising it. Two booleans in a row is how that happens.
  facts: {
    next?: boolean;
    claudeDir: ClaudeDirState;
    viteTs?: ViteTsCoverage | null;
    tscOut?: TscArtifactLocation | null;
  },
): string {
  const { next = false, claudeDir, viteTs = null, tscOut = null } = facts;

  return [
    renderHeader(renderNextNote(next), renderVerdict(survey, claudeDir, viteTs, tscOut)),
    renderPrerequisites(install),
    renderGoal(),
    renderMethod(claudeDir),
    renderSemantics(),
    renderRuleCatalog(),
    renderSchemaSketch(),
    renderAcceptanceGates(claudeDir),
    renderResumePoint(),
    renderSurveyEvidence(survey),
  ].join('\n');
}
