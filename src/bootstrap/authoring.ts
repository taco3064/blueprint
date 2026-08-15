import { AUTHORING_FILE, COMMAND_FILE } from '../project';
import type {
  ClaudeDirState,
  PackageManager,
  TscArtifactLocation,
  ViteTsCoverage,
} from '../project';
import type { SurveyResult } from '../survey';
import { installCommand } from './plan';
import { renderMethod } from './method';
import {
  renderAcceptanceGates,
  renderGoal,
  renderHeader,
  renderNextNote,
  renderPrerequisites,
  renderResumePoint,
  renderRuleCatalog,
  renderSchemaSketch,
  renderSemantics,
  renderSurveyEvidence,
} from './playbook';
import { renderVerdict } from './verdict';
import type { Action } from './types';

/**
 * The brownfield authoring flow — on a repo with real code, scaffolding a preset
 * would be a lie, so this emits the playbook for reading the layers instead, plus
 * the `/blueprint-author` command file. Everything lands on disk before any agent
 * starts: the manual path is not a fallback, it is the same path.
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
   * True when `.claude/` already existed before this run. Required, with no default:
   * the playbook states it as fact, so no caller may leave it unstated.
   */
  claudeDir: ClaudeDirState;
  /** Measured `tsc -b` coverage of the vite config; null when undecidable. */
  viteTs: ViteTsCoverage | null;
  /**
   * Where `tsc -b` keeps its build info when it provably writes nothing into the
   * working tree. Null unless certain — the artifact paragraph assumes artifacts.
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
      // Addressed to the running agent, not about one: a third-person "have an
      // agent execute it" reads as "my job is done" and hands back to a human. The
      // baseline clause is conditional because a sub-threshold early exit locks
      // nothing and doctor is green without a ledger (field issue #12).
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
  // An options object, not positional booleans: positionally, reaching a later field
  // forces every caller to restate an earlier default and silently retire it.
  facts: {
    next?: boolean;
    claudeDir: ClaudeDirState;
    viteTs?: ViteTsCoverage | null;
    tscOut?: TscArtifactLocation | null;
    /**
     * The detected runner, for the script commands the playbook names. Defaulted
     * because a wrong one here is visible in a single line (field run #141).
     */
    packageManager?: PackageManager;
  },
): string {
  const {
    next = false,
    claudeDir,
    viteTs = null,
    tscOut = null,
    packageManager = 'npm',
  } = facts;

  return [
    renderHeader(
      renderNextNote(next),
      renderVerdict(survey, claudeDir, viteTs, tscOut, packageManager),
      claudeDir,
    ),
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
