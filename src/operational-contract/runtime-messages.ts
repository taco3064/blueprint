import type { OperationalText } from './operational-contract';

const message = (value: string): OperationalText => value as OperationalText;

export function renderAuthoringAgentPrompt(file: string): OperationalText {
  return message(`Read ${file} at the repository root and execute it end to end.`);
}

export interface LegacyManualRewriteFact {
  config: string;
  declarations: { layer: string; layout?: string; entry?: string }[];
}

export function renderLegacyUpgradeMessage(facts: {
  dryRun: boolean;
  topology?: 'layer-first' | 'module-first';
  repositoryConfigCount: number;
  manual?: LegacyManualRewriteFact[];
}): OperationalText {
  const manual = (facts.manual ?? []).map(renderManualRewrite);

  return message([
    ...(facts.repositoryConfigCount ? [renderLegacyMigration(facts, manual.length)] : []),
    ...manual,
  ].join(' '));
}

function renderManualRewrite(fact: LegacyManualRewriteFact): string {
  const groups = new Map<string, string[]>();

  for (const declaration of fact.declarations) {
    for (const field of ['layout', 'entry'] as const) {
      const value = declaration[field];

      if (value !== undefined) {
        const key = `${field}: '${value}'`;

        groups.set(key, [...groups.get(key) ?? [], `\`${declaration.layer}\``]);
      }
    }
  }

  const declare = groups.size
    ? `declare ${[...groups].map(([field, layers]) => `\`${field}\` on ${layers.join(', ')}`)
      .join('; ')}`
    : 'keep every layer on the 4.x defaults (`layout: \'file\'`, `entry: \'index\'`)';

  return `${fact.config} is unchanged: its Blueprint 3.2 unit-shape keys are not literal `
    + 'properties, so Blueprint cannot rewrite them without running the file. Rewrite them by '
    + `hand: remove \`architecture.module\` and every layer's \`module\`, then ${declare}.`;
}

function renderLegacyMigration(
  facts: Parameters<typeof renderLegacyUpgradeMessage>[0],
  manual: number,
): string {
  const count = facts.repositoryConfigCount;

  const scope = manual
    ? `${count} of the repository's ${count + manual} Blueprint 3.2 configs`
    : count > 1 ? `all ${count} Blueprint configs in the repository` : 'the config';

  if (facts.dryRun) {
    return facts.topology === 'module-first'
      ? `Blueprint 3.2 phase 1 dry run: would migrate ${scope} to valid 4.0 layer-first. `
      + 'No files were changed; re-run without --dry-run to create the checkpoint before the '
      + 'guarded topology transformation.'
      : 'Blueprint 3.2 dry run: would migrate the config to valid 4.0 layer-first without '
        + 'topology movement. No files were changed; re-run without --dry-run to apply it.';
  }

  return facts.topology === 'module-first'
    ? `Blueprint 3.2 phase 1: migrated ${scope} to valid 4.0 layer-first. Verify and `
    + 'commit this state, then re-run `blueprint init --topology module-first` to start the '
    + 'guarded topology transformation.'
    : 'Blueprint 3.2 config migrated to valid 4.0 layer-first without topology movement.';
}

export type StaleContractCause = 'configured-policy' | 'agent-flag' | 'default-targets';

export function renderStaleContractCause(cause: StaleContractCause): string {
  if (cause === 'configured-policy') {
    return 'no longer in emit.agents';
  }

  return cause === 'agent-flag'
    ? 'narrowed by --agent; declare emit.agents in blueprint.config.mjs to make this permanent'
    : 'not among the emitted targets';
}

export function renderGitignoreArtifactComment(): OperationalText {
  return message('# @kekkai/blueprint artifacts — the agent contract links to these; '
    + 'keep them tracked');
}

const MODULE_FIRST_PRESET_REFUSAL = '--topology module-first cannot be combined with --preset — '
  + '--preset is the layer-first adoption method and cannot choose domain modules. Run init '
  + '--topology module-first without --preset: a proven-empty React/Vue application opens the '
  + 'canonical module-first runway with no domain module, and existing source enters module-first '
  + 'authoring.';

export function renderInitOptionError(
  kind: 'nuxt' | 'module-first-preset' | 'preset-authoring' | 'authored-config',
): OperationalText {
  if (kind === 'nuxt') {
    return message('Nuxt is not supported. Blueprint enforces the dependency flow through '
      + 'static import analysis, and Nuxt\'s auto-imports leave no import statements to analyze '
      + '— the result would be a hollow, false "clean". See '
      + 'https://taco3064.github.io/blueprint/guide/field-tested.');
  }

  if (kind === 'module-first-preset') {
    return message(`${MODULE_FIRST_PRESET_REFUSAL} No files were changed.`);
  }

  if (kind === 'preset-authoring') {
    return message('--preset and --authoring are mutually exclusive — pick one.');
  }

  return message('blueprint.config.mjs differs from what init would scaffold — so it is yours, '
    + 'not init\'s output, and re-authoring rewrites it from scratch rather than merging. The '
    + 'structure is reproducible; the comments explaining WHY each threshold and ownership was '
    + 'chosen are not. Copy anything you want to keep, then delete the file yourself if you '
    + 'really want the playbook. Put those comments back into the rewritten config, each beside '
    + 'the clause it explains — not only into the report, which is read once while the config is '
    + 'what the next re-authoring will read.');
}

export type PreflightUnavailable
  = | 'repository-needs-scope'
    | 'worktree-needs-scope'
    | 'head-needs-scope'
    | 'inspection-needs-scope'
    | 'outside-worktree'
    | 'outside-recoverable-head';

export function renderPreflightUnavailable(kind: PreflightUnavailable): OperationalText {
  const messages: Record<PreflightUnavailable, string> = {
    'repository-needs-scope': 'Git repository membership requires one selected application.',
    'worktree-needs-scope': 'Worktree cleanliness requires one selected application.',
    'head-needs-scope': 'A recoverable HEAD requires one selected application.',
    'inspection-needs-scope': 'Inspection requires one selected application.',
    'outside-worktree': 'Worktree cleanliness cannot be checked outside a Git worktree.',
    'outside-recoverable-head': 'A recoverable HEAD cannot be checked outside a Git worktree.',
  };

  return message(messages[kind]);
}

export function renderScopeCountReason(count: number): OperationalText {
  return message(`Exactly one application scope must be selected; received ${count}.`);
}

export function renderGitProbeFallback(
  kind: 'worktree-status' | 'recoverable-head',
): OperationalText {
  return message(kind === 'worktree-status'
    ? 'Git worktree status could not be read.'
    : 'No committed, recoverable HEAD exists.');
}

export function renderDirtyWorktreeReason(): OperationalText {
  return message('The Git worktree has uncommitted changes.');
}

export function renderInspectionFailure(cause: string): OperationalText {
  return message(`Pre-transform inspection could not produce usable evidence: ${cause}`);
}

export type TopologyReason
  = | 'module-first-preset'
    | 'configured-preset'
    | 'repository-preset'
    | 'repository-mismatch'
    | 'scope-unresolved'
    | 'topology-unset';

export function renderTopologyReason(facts: {
  kind: TopologyReason;
  repository?: 'layer-first' | 'module-first' | null;
  requested?: 'layer-first' | 'module-first';
}): OperationalText {
  if (facts.kind === 'module-first-preset') {
    return message(MODULE_FIRST_PRESET_REFUSAL);
  }

  if (facts.kind === 'configured-preset') {
    return message('--preset cannot be applied to an application with an existing authored '
      + 'blueprint.config.mjs. Use plain init to repair it, or request an explicit opposite '
      + '--topology without --preset to transform it. No files were changed.');
  }

  if (facts.kind === 'repository-preset') {
    return message('--preset is layer-first adoption only, but this repository is authoritatively '
      + 'module-first. Run init without --preset to adopt the inherited topology: a proven-empty '
      + 'React/Vue application opens the module-first runway, and existing source enters '
      + 'module-first authoring. No files were changed.');
  }

  if (facts.kind === 'repository-mismatch') {
    return message(`This application has no local config, but the repository is already ${facts.repository}. `
      + `The requested ${facts.requested} target would create unsupported mixed topology. Adopt `
      + `the application as ${facts.repository}, or run the opposite topology command from an `
      + 'already adopted application to transform the whole repository. No files were changed.');
  }

  if (facts.kind === 'scope-unresolved') {
    return message('Cannot determine the current architecture topology while multiple application '
      + 'scopes remain unresolved. Select one application, run `blueprint survey --source-root '
      + '<application>/src`, then run init from that application root.');
  }

  return message('This repository has no authoritative Blueprint topology. Source-tree shape is '
    + 'survey evidence, not a topology declaration. Re-run with one explicit target:\n'
    + '  blueprint init --topology layer-first\n'
    + 'or\n'
    + '  blueprint init --topology module-first');
}

export function renderMixedRepositoryTopology(applications: string): OperationalText {
  return message('Blueprint configs in one repository must share one topology, but mixed topology '
    + `was found:\n  ${applications}\nAlign every config before init; no files were changed.`);
}

export function renderFrameworkDetectionFailure(): OperationalText {
  return message('Could not detect a framework (vue or react). Re-run with --framework vue|react.');
}

export function renderMissingBlueprintExport(): OperationalText {
  return message('missing default export.');
}

export function renderContainmentRefusal(path: string, kind: string): OperationalText {
  return message(`Refused "${path}" (${kind}) — it resolves outside the project root, `
    + 'and init only ever writes inside the repo it runs in, so nothing was written. Every path '
    + 'is relative to the project root: no leading "../", no absolute path, no drive letter. The '
    + 'config fields that set one are `emit.handbook` and `emit.agents[].path`.');
}

export function renderAgentCommand(agent: string, prompt: string): OperationalText {
  return message(`${agent} "${prompt}"`);
}

export function renderAgentCommandOutput(command: string): OperationalText {
  return message(`  ${command}`);
}

export function renderAgentLaunchHeader(agent: string): OperationalText {
  return message(`\nLaunching ${agent} (interactive — your agent CLI, your permissions):`);
}

export function renderAgentLaunchFailure(
  agent: string,
  cause: string,
  command: string,
): OperationalText {
  return message(`could not launch "${agent}" (${cause}). Everything is already on disk — run it `
    + `yourself:\n    ${command}`);
}

/** @deprecated Pass `{ files, threshold, topology }`; this form renders the layer-first note. */
export function renderFreshScaffoldNote(files: number, threshold: number): OperationalText;
export function renderFreshScaffoldNote(facts: {
  files: number;
  threshold: number;
  topology: 'layer-first' | 'module-first';
}): OperationalText;

export function renderFreshScaffoldNote(
  ...input:
    | [files: number, threshold: number]
    | [facts: { files: number; threshold: number; topology: 'layer-first' | 'module-first' }]
): OperationalText {
  const facts = input.length === 2
    ? { files: input[0], threshold: input[1], topology: 'layer-first' as const }
    : input[0];

  const force = `Force the authoring playbook instead with: blueprint init --topology ${facts.topology} `
    + '--authoring.';

  if (facts.topology === 'module-first') {
    return message('Proven-empty application (0 source files) — scaffolding the framework '
      + 'preset\'s canonical governance as a module-first runway with `modules: []`: no domain '
      + 'module is invented, and product requirements grow modules through the module growth '
      + `protocol in the generated handbook. No blueprint-authoring.md is written on this path. ${force}`);
  }

  return message(`Fresh scaffold (${facts.files} source files < ${facts.threshold}) — scaffolding `
    + 'the framework preset directly; no blueprint-authoring.md is written on this path. '
    + force);
}

/** @deprecated Pass `forcedExit` (`'threshold'` or `null`) instead of `forcedBelowThreshold`. */
export function renderAuthoringFlowBanner(facts: {
  dryRun: boolean;
  files: number;
  forcedBelowThreshold: boolean;
  threshold: number;
}): OperationalText;
export function renderAuthoringFlowBanner(facts: {
  dryRun: boolean;
  files: number;
  forcedExit: 'threshold' | 'runway' | null;
  threshold: number;
}): OperationalText;

export function renderAuthoringFlowBanner(facts: {
  dryRun: boolean;
  files: number;
  threshold: number;
} & (
  | { forcedBelowThreshold: boolean }
  | { forcedExit: 'threshold' | 'runway' | null }
)): OperationalText {
  const forcedExit = forcedExitOf(facts);

  const forced = {
    threshold: ` — below the brownfield threshold (${facts.threshold} source files), forced by `
      + '--authoring; the playbook\'s own verdict will be the early exit',
    runway: ' — a proven-empty module-first application, forced by --authoring; the playbook\'s '
      + 'own verdict will be the canonical module-first runway',
  };

  return message(`blueprint ${facts.dryRun ? 'init --dry-run' : 'init'} · without a config → `
    + `authoring flow (${facts.files} source files surveyed)${forcedExit
      ? forced[forcedExit]
      : ''}`);
}

function forcedExitOf(
  facts: { forcedBelowThreshold: boolean } | { forcedExit: 'threshold' | 'runway' | null },
): 'threshold' | 'runway' | null {
  if ('forcedExit' in facts) {
    return facts.forcedExit;
  }

  return facts.forcedBelowThreshold ? 'threshold' : null;
}

export function renderInitBanner(
  dryRun: boolean,
  framework: string,
  manager: string,
): OperationalText {
  return message(`blueprint ${dryRun ? 'init --dry-run' : 'init'} · ${framework} · ${manager}`);
}

export function renderForkNote(note: string): OperationalText {
  return message(`· ${note}`);
}

export function renderAgentSessionNote(agent: string, existingConfig: boolean): OperationalText {
  return message(existingConfig
    ? `\n--agent ${agent}: nothing to author (blueprint.config.mjs exists) — no session launched; `
    + `contract emitted for ${agent} only.`
    : `\n--agent ${agent}: fresh scaffold, nothing to author — no session launched; contract `
      + `emitted for ${agent} only.`);
}

export function renderActionLine(
  kind: string,
  note: OperationalText,
  mode: 'dry-run' | 'applied' | 'failed',
): OperationalText {
  if (kind === 'instruct') {
    return message(`  · ${note}`);
  }

  const mark = mode === 'dry-run' ? 'would' : mode === 'failed' ? '✗' : kind === 'rm' ? '−' : '✓';

  return message(`  ${mark} ${kind}: ${note}`);
}

export function renderInstallStarting(note: OperationalText, command: string): OperationalText {
  return message(`  → install: ${note}\n`
    + `      ${command}\n`
    + '      This is the one step that needs the registry. Silence while it works is normal; '
    + 'minutes of silence means it cannot get there — stop it and run the line above yourself, '
    + 'or re-run init with `--no-install`. No version list to find first: these are your '
    + 'project\'s '
    + 'dependencies, installed unpinned so eslint resolves to the newest supported major.\n'
    + '      Stopping is safe: this is the last step, so every file above is already on disk. '
    + 'What stopping omits is these packages in `package.json` — this line is the only thing that '
    + 'records them there, so until it runs, a failure naming one of them is that gap and not a '
    + 'broken adoption.');
}

export function renderInitStopped(facts: {
  cause: string;
  failedKind: string;
  skipped: { kind: string; note: OperationalText }[];
}): OperationalText {
  const skipped = facts.skipped.length
    ? `, and ${facts.skipped.length} planned effect(s) did NOT happen:\n${facts.skipped
      .map((action) => `    · ${action.kind}: ${action.note}`).join('\n')}`
    : ' — nothing else was planned below it';

  return message(`${facts.cause}\n\n  init stopped at the ${facts.failedKind} step above. `
    + `Everything printed before it is on disk${skipped}\n\n`
    + '  Re-running `blueprint init` is idempotent: fix the cause and the missing effects land, '
    + 'the applied ones stay. To finish the file plan without this step, run '
    + '`blueprint init --no-install` — the dependency list is then printed for you to install '
    + 'yourself.');
}

export function renderConfigReadFailure(location: string, cause: string): OperationalText {
  return message(`${location}: ${cause}`);
}

export function renderEslintRuntimeFailure(
  kind: 'wrong-package' | 'missing-executable',
): OperationalText {
  return message(kind === 'wrong-package'
    ? 'resolved package is not eslint'
    : 'eslint package has no executable');
}

export function renderModuleToLayerEvidenceTopologyError(): OperationalText {
  return message('Module-first → layer-first evidence requires a module-first architecture.');
}
