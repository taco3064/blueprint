import fs from 'node:fs';
import path from 'node:path';

import { resolveArchitecture } from '../config';
import type { Blueprint, ResolvedArchitecture } from '../config';
import { defaultGitReader, relativeFilesystemPath } from '../project';
import type {
  GitReader, LayerToModuleObligation, ProjectState, TransformationObligationFailure,
  TransformationSource,
} from '../project';
import { analyze } from './analyze';
import { memberFailures } from './transformation-members';
import { importAnalysis, scan } from './scan';

export interface TransformationObligationResult {
  ok: boolean;
  failures: TransformationObligationFailure[];
}

const failure = (
  code: string, details: Omit<TransformationObligationFailure, 'code'> = {},
): TransformationObligationFailure => ({ code, ...details });

interface Context {
  root: string; obligation: LayerToModuleObligation; blueprint: Blueprint;
  state: ProjectState; git: GitReader; resolved: ResolvedArchitecture; repositoryRoot: string;
}

export function verifyTransformationObligation(input: {
  root: string; obligation: LayerToModuleObligation; blueprint: Blueprint;
  state: ProjectState; git?: GitReader;
}): TransformationObligationResult {
  const git = input.git ?? defaultGitReader;
  const repository = git(['rev-parse', '--show-toplevel'], input.root);

  const context: Context = {
    ...input, git, resolved: resolveArchitecture(input.blueprint.architecture),
    repositoryRoot: repository.status === 0 ? repository.stdout.trim() : '',
  };

  const failures = [
    ...authorityFailures(context), ...inventoryFailures(context),
    ...decisionFailures(context), ...memberFailures(context), ...finalFailures(context),
  ];

  return { ok: failures.length === 0, failures };
}

function authorityFailures(context: Context): TransformationObligationFailure[] {
  const { git, root, obligation, state, repositoryRoot } = context;
  const failures: TransformationObligationFailure[] = [];
  const head = git(['rev-parse', 'HEAD'], root);

  const relativeRoot = repositoryRoot
    ? relativeFilesystemPath(repositoryRoot, root).split(path.sep).join('/') || '.'
    : '';

  failures.push(...originPositionFailures(context, relativeRoot));

  if (!repositoryRoot) {
    failures.push(failure('repository-root-unavailable'));
  }

  if (head.status !== 0 || head.stdout.trim() !== obligation.origin.head) {
    failures.push(failure('origin-head-changed', { expected: obligation.origin.head }));
  }

  if (state.framework !== obligation.origin.framework) {
    failures.push(failure('framework-changed'));
  }

  if (state.nextRouter !== obligation.origin.router) {
    failures.push(failure('router-changed'));
  }

  return failures;
}

function originPositionFailures(
  context: Context, relativeRoot: string,
): TransformationObligationFailure[] {
  const { obligation, resolved } = context;
  const failures: TransformationObligationFailure[] = [];

  if (!safePath(obligation.origin.applicationRoot)
    || !safePath(obligation.origin.sourceRoot)) {
    failures.push(failure('unsafe-origin-scope'));
  }

  if (relativeRoot !== obligation.origin.applicationRoot) {
    failures.push(failure('application-root-changed'));
  }

  if (obligation.origin.selectedScope !== obligation.origin.sourceRoot
    || resolved.sourceRoot !== obligation.origin.sourceRoot) {
    failures.push(failure('source-scope-changed'));
  }

  return failures;
}

function inventoryFailures(context: Context): TransformationObligationFailure[] {
  const expected = committedSources(context);

  if (expected === null) {
    return [failure('origin-inventory-unavailable', { expected: context.obligation.origin.head })];
  }

  const listed = context.obligation.origin.sources;
  const recorded = new Map(listed.map((source) => [source.unit, source]));
  const failures: TransformationObligationFailure[] = [];

  if (recorded.size !== listed.length) {
    failures.push(failure('duplicate-origin-unit'));
  }

  failures.push(...sourceIdentityFailures(expected, recorded));

  for (const source of listed) {
    const route = source.members.every((member) => /\/(?:pages|app)\//.test(`/${member}`));

    if (route !== (source.role === 'route-composition')) {
      failures.push(failure('origin-role-mismatch', { subject: source.unit }));
    }
  }

  return failures;
}

function sourceIdentityFailures(
  expected: Map<string, TransformationSource>, recorded: Map<string, TransformationSource>,
): TransformationObligationFailure[] {
  const changed = [...expected].flatMap(([unit, source]) => {
    const actual = recorded.get(unit);

    return actual?.role === source.role && actual.members.join('\0') === source.members.join('\0')
      ? []
      : [failure('origin-source-mismatch', { subject: unit })];
  });

  const added = [...recorded.keys()].filter((unit) => !expected.has(unit))
    .map((unit) => failure('unrecorded-origin-source', { subject: unit }));

  return [...changed, ...added];
}

function committedSources(context: Context): Map<string, TransformationSource> | null {
  const { git, obligation } = context;

  if (!safePath(obligation.origin.applicationRoot)
    || !safePath(obligation.origin.sourceRoot)) {
    return new Map();
  }

  const result = git(['ls-tree', '-r', '--name-only', obligation.origin.head, '--',
    repositoryPath(context, obligation.origin.sourceRoot)], context.repositoryRoot);

  if (result.status !== 0) {
    return null;
  }

  const applicationPrefix = obligation.origin.applicationRoot === '.'
    ? ''
    : `${obligation.origin.applicationRoot}/`;

  const files = result.stdout.split(/\r?\n/)
    .filter((file) => /\.(?:js|jsx|ts|tsx|mjs|cjs|vue)$/.test(file))
    .map((file) => file.slice(applicationPrefix.length));

  const sources = new Map<string, TransformationSource>();

  for (const file of files) {
    addMember(sources, obligation.origin.sourceRoot, file);
  }

  return sources;
}

function addMember(
  sources: Map<string, TransformationSource>, sourceRoot: string, file: string,
): void {
  const [layer, rawUnit, ...nested] = path.posix.relative(sourceRoot, file).split('/');

  const routeLayer = layer === 'pages' || layer === 'app';

  if (!rawUnit || (!routeLayer && layer !== 'containers')) {
    return;
  }

  const unit = layer === 'containers' && nested.length === 0
    ? layer
    : `${layer}/${rawUnit.replace(/\.[^.]+$/, '')}`;

  const role = routeLayer ? 'route-composition' as const : 'container-seed' as const;
  const current = sources.get(unit) ?? { role, unit, members: [] };

  current.members.push(file);
  current.members.sort();
  sources.set(unit, current);
}

function decisionFailures(context: Context): TransformationObligationFailure[] {
  const failures: TransformationObligationFailure[] = [];
  const sources = new Map(context.obligation.origin.sources.map((source) => [source.unit, source]));
  const decisions = new Map<string, string[]>();

  for (const decision of context.obligation.target.decisions) {
    if (decisions.has(decision.source)) {
      failures.push(failure('duplicate-decision', { subject: decision.source }));
    }

    if (!sources.has(decision.source)) {
      failures.push(failure('unknown-decision-source', { subject: decision.source }));
    }

    decisions.set(decision.source, decision.destinations);
  }

  for (const source of sources.values()) {
    failures.push(...sourceFailures(context, source, decisions.get(source.unit)));
  }

  return failures;
}

function sourceFailures(
  context: Context, source: TransformationSource, destinations: string[] | undefined,
): TransformationObligationFailure[] {
  if (!destinations?.length) {
    return [failure('missing-destination-decision', { subject: source.unit })];
  }

  return [
    ...source.members.flatMap((member) => !safePath(member)
      ? [failure('unsafe-source-member', { subject: member })]
      : fs.existsSync(path.join(context.root, member)) && !source.unit.startsWith('app/')
        ? [failure('source-member-remains', { subject: member })]
        : []),
    ...destinations.flatMap((destination) => destinationFailures(context, source, destination)),
  ];
}

function destinationFailures(
  context: Context, source: TransformationSource, value: string,
): TransformationObligationFailure[] {
  if (!safePath(value) || !safeExistingPath(context.root, value)) {
    return [failure('unsafe-destination', { subject: value })];
  }

  if (!fs.existsSync(path.join(context.root, value))) {
    return [failure('destination-missing', { subject: value })];
  }

  const position = context.resolved.classify(value);

  if (source.role === 'route-composition') {
    return position?.kind === 'container' && position.module.name === 'app'
      ? []
      : [failure('route-destination-not-app', { subject: value })];
  }

  return position !== null && 'module' in position
    && position.module !== null && position.module.name !== 'app'
    ? []
    : [failure('container-destination-not-module', { subject: value })];
}

function safeExistingPath(root: string, value: string): boolean {
  try {
    const realRoot = fs.realpathSync(root);
    const realValue = fs.realpathSync(path.join(root, value));
    const relative = path.relative(realRoot, realValue);

    return !path.isAbsolute(relative)
      && relative !== '..' && !relative.startsWith(`..${path.sep}`);
  } catch {
    return true;
  }
}

function finalFailures(context: Context): TransformationObligationFailure[] {
  const { obligation, resolved } = context;
  const failures: TransformationObligationFailure[] = [];

  if (resolved.topology !== 'module-first') {
    failures.push(failure('target-not-module-first'));
  }

  if (!resolved.modules.some((module) => module.name === 'app')) {
    failures.push(failure('reserved-app-absent'));
  }

  failures.push(...repeatedRoleFailures(obligation, resolved));

  const current = currentArchitectureFailures(context);

  if (current.parseFailures) {
    failures.push(failure('final-import-analysis-failed'));
  }

  if (current.errors) {
    failures.push(failure('final-architecture-errors', { actual: String(current.errors) }));
  }

  return failures;
}

function currentArchitectureFailures(
  context: Context,
): { parseFailures: number; errors: number } {
  const { root, resolved, blueprint, state } = context;
  const currentScan = scan(root, resolved.sourceRoot);
  const findings = analyze(currentScan, blueprint, state.dependencies);

  return {
    parseFailures: importAnalysis(currentScan).parseFailures.length,
    errors: findings.filter((finding) => finding.severity === 'error').length,
  };
}

function repeatedRoleFailures(
  obligation: LayerToModuleObligation,
  resolved: ResolvedArchitecture,
): TransformationObligationFailure[] {
  const roles = new Set(obligation.origin.sources.map((source) => source.role));

  const forbidden = [...(roles.has('route-composition') ? ['pages'] : []),
    ...(roles.has('container-seed') ? ['containers'] : [])];

  return forbidden
    .filter((layer) => resolved.layerNames.includes(layer))
    .map((layer) => failure('recorded-role-repeated', { subject: layer }));
}

function repositoryPath(context: Context, value: string): string {
  return context.obligation.origin.applicationRoot === '.'
    ? value
    : `${context.obligation.origin.applicationRoot}/${value}`;
}

function safePath(value: string): boolean {
  if (!value || path.win32.parse(value).root) {
    return false;
  }

  const relative = path.posix.normalize(value.replaceAll('\\', '/'));

  return relative !== '..' && !relative.startsWith('../');
}
