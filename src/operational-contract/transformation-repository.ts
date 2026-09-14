import type {
  ArchitectureTopologyFact,
  TransformationActionFact,
  TransformationPreflightFact,
} from './transformation';
import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';
import {
  renderTransformationBlockedNextSteps,
  transformationPreflightFailures,
} from './transformation';

export interface RepositoryPlaybookFacts {
  current: string;
  target: string;
  applications: string[];
  sections: string[];
  cleanup: string;
}

export function renderRepositoryPlaybook(facts: RepositoryPlaybookFacts): string {
  return [
    '# Blueprint repository-wide topology transformation',
    '',
    `Current repository topology: \`${facts.current}\``,
    `Target repository topology: \`${facts.target}\``,
    `Adopted applications: ${facts.applications.map((application) => `\`${application}\``).join(', ')}`,
    '',
    'This is one atomic repository transformation. Complete every application work unit before',
    'claiming success. Do not commit or report a supported state while valid configs disagree.',
    'After all movements and config cutovers, run inspect, deps, emitted ESLint, lint, typecheck,',
    'test, and build for every application. Then scan every valid blueprint.config.mjs again and',
    `prove that all resolve to \`${facts.target}\`.`,
    '',
    `Delete ${facts.cleanup} only after every application passes and the repository has one topology.`,
    '',
    ...facts.sections,
  ].join('\n\n');
}

export function renderRepositoryReady(facts: {
  current: ArchitectureTopologyFact;
  target: ArchitectureTopologyFact;
  applications: number;
}): OperationalText {
  return operationalText([
    `${facts.current} → ${facts.target} repository transformation preflight passed.`,
    `  ${facts.applications} adopted applications are one atomic topology change.`,
    '  Read blueprint-authoring.md from the repository root and complete every application',
    '  before reporting success; a mixed intermediate tree is never a supported result.',
  ].join('\n'));
}

export function renderRepositoryNarration(facts: {
  dryRun: boolean;
  current: ArchitectureTopologyFact;
  target: ArchitectureTopologyFact;
  applications: number;
}): string {
  return `blueprint ${facts.dryRun ? 'init --dry-run' : 'init'} · `
    + `${facts.current} → ${facts.target} repository transformation `
    + `authoring (${facts.applications} applications; Git preflight passed)`;
}

export function renderRepositoryLauncherConflictError(): string {
  return 'Blueprint configs in one repository disagree on Claude authoring launcher emission. '
    + 'Align emit.agents across every adopted application before transforming topology; '
    + 'no files were changed.';
}

export function renderRepositoryRouterError(facts: {
  applicationRoot: string;
  current: ArchitectureTopologyFact;
  router: 'app' | 'both' | 'pages' | null;
}): OperationalText | null {
  if (facts.router === 'app') {
    return null;
  }

  if (facts.current === 'layer-first' && facts.router === null) {
    return operationalText(
      'Cannot verify a Next.js App Router surface for the repository-wide layer-first → '
      + 'module-first transformation. Establish the application router identity, then re-run. '
      + 'No files were changed.',
    );
  }

  return operationalText(`Cannot safely transform repository application ${facts.applicationRoot}: its Next.js `
    + `router state is ${facts.router ?? 'unresolved'}. Resolve the router identity first, `
    + 'then re-run; no files were changed.');
}

export function renderRepositoryPreflightError(
  preflight: TransformationPreflightFact,
  application: string,
): string {
  const failures = transformationPreflightFailures(preflight)
    .map(({ label, reason }) => `- ${application} · ${label}: ${reason}`);

  return 'Repository topology transformation preflight failed before mutation:\n'
    + `${failures.join('\n')}\n${renderTransformationBlockedNextSteps()}`;
}

export function renderRepositoryAction(
  action: TransformationActionFact,
  applied: boolean,
): string {
  return `  ${applied ? '✓' : 'would'} ${action.kind}: ${action.note}`;
}
