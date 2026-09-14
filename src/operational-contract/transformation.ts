import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';
export interface TransformationObligationFailure {
  code: string;
  subject?: string;
  expected?: string;
  actual?: string;
}

export type ArchitectureTopologyFact = 'layer-first' | 'module-first';

export interface FindingFact {
  severity: 'error' | 'warn' | 'info';
  rule: string;
  path: string;
  subject: string;
  message: string;
}

export interface TransformationCheckFact {
  ok: boolean;
  reason?: string;
}

export interface TransformationPreflightFact {
  ok: boolean;
  repository: TransformationCheckFact & { root?: string };
  worktree: TransformationCheckFact & { changes?: string[] };
  head: TransformationCheckFact & { commit?: string };
  scope: TransformationCheckFact & { selected?: string };
  inspection: TransformationCheckFact & { findings?: FindingFact[] };
}

export interface ProjectTransformationFact {
  framework: string | null;
  hasNext: boolean;
  nextRouter: 'app' | 'both' | 'pages' | null;
}

export interface TransformationEdgeFact {
  from: string;
  to: string;
  count: number;
}

export interface RelativeImportFact {
  importer: string;
  specifier: string;
  structuralTarget: string | null;
  targetUnitMeasured: boolean;
}

export interface LayerToModuleCandidateFact {
  seed: string;
  source: 'container' | 'page' | 'app';
  memberPaths: string[];
  reachableUnits: string[];
  directImports: TransformationEdgeFact[];
  closureEdges: TransformationEdgeFact[];
  closureConsumers: TransformationEdgeFact[];
  unresolvedAliasLikeImports: string[];
}

export interface LayerToModuleEvidenceFact {
  sourceRoot: string;
  aliases: Record<string, string>;
  resolutionBasis: 'blueprint-config' | 'survey-detected';
  rootWiring: string[];
  sourceLayers: { layer: string; units: string[] }[];
  seedSource: 'containers' | 'pages' | 'none';
  candidates: LayerToModuleCandidateFact[];
  routerCandidates: LayerToModuleCandidateFact[];
  overlaps: { unit: string; seeds: string[] }[];
  orphans: string[];
  edges: TransformationEdgeFact[];
  cycles: string[][];
  collisionRisks: { identity: string; units: string[] }[];
  unresolvedAliasLikeImports: { unit: string; specifier: string }[];
  relativeImports: RelativeImportFact[];
  unknownDynamicImports: number;
  parseFailures: { path: string; message: string }[];
}

export interface ModuleToLayerEvidenceFact {
  sourceRoot: string;
  aliases: Record<string, string>;
  rootWiring: string[];
  modules: { name: string; dependsOn: string[] }[];
  layers: { name: string; layout: 'folder' | 'file'; entry: string }[];
  architectureBasis: { alias: string };
  aliasCutovers: {
    alias: string;
    target: string;
    disposition: 'preserve' | 'rewrite-or-remove';
    mappedDestinations: string[];
  }[];
  mappings: {
    source: string;
    destination: string;
    module: string;
    layer: string;
    layout: 'folder' | 'file' | 'container' | 'router';
    disposition: 'move' | 'agent-router-decision' | 'preserve-next-route';
  }[];
  collisions: { destination: string; sources: string[] }[];
  orphans: string[];
  edges: TransformationEdgeFact[];
  cycles: string[][];
  unresolvedAliasLikeImports: { unit: string; specifier: string }[];
  relativeImports: RelativeImportFact[];
  unknownDynamicImports: number;
  parseFailures: { path: string; message: string }[];
}

export type TransformationActionFact = {
  kind: 'install' | 'instruct' | 'mkdir' | 'rm' | 'write';
  note: OperationalText;
};

export function renderTransformationInstallNote(): OperationalText {
  return operationalText('@kekkai/blueprint (the config imports it)');
}

export function renderTransformationInstallHandoff(command: string): OperationalText {
  return operationalText(
    `Install skipped — verification requires @kekkai/blueprint, so run:\n    ${command}`,
  );
}

export function renderTransformationWriteNote(
  direction: 'layer-to-module' | 'module-to-layer' | 'repository',
  authoringFile: string,
): OperationalText {
  const description = direction === 'layer-to-module'
    ? 'layer-first → module-first transformation evidence + playbook'
    : direction === 'module-to-layer'
      ? 'module-first → layer-first mapping evidence + playbook'
      : 'repository-wide topology transformation playbook';

  return operationalText(`${authoringFile} (${description})`);
}

export function renderTransformationObligationWriteNote(file: string): OperationalText {
  return operationalText(`${file} (machine-verifiable layer-first → module-first obligation)`);
}

export function renderTransformationRetireNote(file: string): OperationalText {
  return operationalText(`${file} (verified transformation obligation retired)`);
}

export function renderTransformationObligationError(fact:
  | { kind: 'invalid-json'; file: string }
  | { kind: 'invalid-schema'; file: string }
  | { kind: 'missing-config'; file: string }
  | { kind: 'reauthoring'; file: string }
  | { kind: 'incomplete'; failures: TransformationObligationFailure[] },
): OperationalText {
  if (fact.kind === 'invalid-json') {
    return operationalText(`${fact.file} is not valid JSON`);
  }

  if (fact.kind === 'invalid-schema') {
    return operationalText(`${fact.file} is not a supported transformation obligation`);
  }

  if (fact.kind === 'missing-config') {
    return operationalText('The recorded LF→MF transformation has no current config to verify.');
  }

  if (fact.kind === 'reauthoring') {
    return operationalText(
      'Explicit re-authoring does not complete the recorded LF→MF transformation. '
      + `Resolve or intentionally remove ${fact.file} before starting a new authoring flow.`,
    );
  }

  return operationalText(`LF→MF transformation incomplete:\n- ${fact.failures
    .map(renderObligationFailure).join('\n- ')}`);
}

export function renderObligationFailure(fact: TransformationObligationFailure): string {
  const subject = fact.subject || '';
  const expected = fact.expected || '';
  const actual = fact.actual || '0';

  const labels: Record<string, string> = {
    'repository-root-unavailable': 'repository root is unavailable',
    'origin-head-changed': `HEAD must remain at the recorded origin ${expected}`,
    'framework-changed': 'framework changed',
    'router-changed': 'framework router position changed',
    'unsafe-origin-scope': 'recorded application or source scope is unsafe',
    'application-root-changed': 'application root changed',
    'source-scope-changed': 'source scope changed',
    'duplicate-origin-unit': 'origin contains duplicate source units',
    'origin-source-mismatch': `origin source does not match Git: ${subject}`,
    'unrecorded-origin-source': `unrecorded origin source: ${subject}`,
    'origin-role-mismatch': `origin role does not match members: ${subject}`,
    'duplicate-decision': `duplicate decision for ${subject}`,
    'unknown-decision-source': `unrecorded decision source ${subject}`,
    'missing-destination-decision': `recorded source ${subject} has no destination decision`,
    'unsafe-source-member': `unsafe source member: ${subject}`,
    'source-member-remains': `source member still exists: ${subject}`,
    'unsafe-destination': `unsafe destination: ${subject}`,
    'destination-missing': `destination does not exist: ${subject}`,
    'route-destination-not-app': `route destination is not under reserved app: ${subject}`,
    'container-destination-not-module': `container destination is not in an ordinary module: ${subject}`,
    'target-not-module-first': 'current config is not module-first',
    'reserved-app-absent': 'reserved app is absent',
    'final-import-analysis-failed': 'final import analysis failed',
    'final-architecture-errors': `final architecture has ${actual} error finding(s)`,
    'recorded-role-repeated': `recorded LF ${subject} role is a target layer`,
  };

  return labels[fact.code] ?? `transformation verification failed (${fact.code})`;
}

export function renderTransformationReady(
  direction: 'layer-to-module' | 'module-to-layer',
): OperationalText {
  return operationalText(direction === 'layer-to-module'
    ? [
        'Layer-first → module-first transformation preflight passed.',
        '  The CLI measured candidates and graph evidence; domain ownership remains an Agent',
        '  decision. Read blueprint-authoring.md and execute it end to end with git mv.',
      ].join('\n')
    : [
        'Module-first → layer-first transformation preflight passed.',
        '  The CLI measured destinations, collisions, and graph evidence; semantic placement',
        '  remains an Agent decision. Read blueprint-authoring.md and execute it with git mv.',
      ].join('\n'));
}

export function renderTransformationNarration(facts: {
  dryRun: boolean;
  direction: 'layer-first → module-first' | 'module-first → layer-first';
  totalFiles: number;
}): string {
  return `blueprint ${facts.dryRun ? 'init --dry-run' : 'init'} · ${facts.direction} `
    + `transformation authoring (${facts.totalFiles} source files surveyed; Git preflight passed)`;
}

export function renderTransformationAction(
  action: TransformationActionFact,
  applied: boolean,
): string {
  return `  ${applied ? '✓' : 'would'} ${action.kind}: ${action.note}`;
}

export function renderLayerToModuleRouterError(
  router: ProjectTransformationFact['nextRouter'],
): OperationalText | null {
  if (router === 'app') {
    return null;
  }

  if (router === null) {
    return operationalText(
      'Cannot verify a Next.js App Router surface for this layer-first → module-first '
      + 'transformation. Establish one application scope with a physical `app/**` tree, then '
      + 're-run `blueprint init --topology module-first`. No files were changed.',
    );
  }

  return operationalText(
    'Next.js Pages Router → module-first requires a framework router migration, not a '
    + 'folder-only topology transformation. Migrate to App Router separately, then re-run '
    + '`blueprint init --topology module-first`. No files were changed.',
  );
}

export function renderModuleToLayerAuthorityError(): string {
  return 'Module-first → layer-first transformation requires the current module-first '
    + 'blueprint.config.mjs as authority for modules, inner layers, unit layouts, aliases, and '
    + 'the module DAG. Run `blueprint init --topology module-first`, have the Agent author and '
    + 'verify the module-first config, commit the clean state, then run '
    + '`blueprint init --topology layer-first`. '
    + 'No files were changed.';
}

export function renderModuleToLayerRouterError(
  router: ProjectTransformationFact['nextRouter'],
): string {
  const observed = router === 'both'
    ? 'both App Router and Pages Router trees'
    : router === 'pages'
      ? 'only a Pages Router tree'
      : 'no physical router tree';

  return `Cannot safely interpret this Next.js module-first → layer-first transformation: found ${observed}. `
    + 'This path preserves one physical App Router `app/**` tree and does not choose or migrate '
    + 'router modes. Resolve the router identity first, then re-run; no files were changed.';
}

export function renderTransformationPreflightError(
  direction: 'Layer-first → module-first' | 'Module-first → layer-first',
  preflight: TransformationPreflightFact,
): string {
  const failures = transformationPreflightFailures(preflight)
    .map(({ label, reason }) => `- ${label}: ${reason}`);

  return `${direction} transformation preflight failed before mutation:\n`
    + `${failures.join('\n')}\nResolve every item and re-run; no files were changed.`;
}

export function transformationPreflightFailures(
  preflight: TransformationPreflightFact,
): { label: string; reason: string | undefined }[] {
  const checks: [string, TransformationCheckFact][] = [
    ['Git repository', preflight.repository],
    ['clean worktree', preflight.worktree],
    ['recoverable HEAD', preflight.head],
    ['application scope', preflight.scope],
    ['pre-transform inspection', preflight.inspection],
  ];

  return checks.filter(([, check]) => !check.ok)
    .map(([label, check]) => ({ label, reason: check.reason }));
}
