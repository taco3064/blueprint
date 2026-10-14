import type {
  Blueprint, Framework, MustNotCheck, ResolvedArchitecture, ResolvedProhibition,
} from '../config';
import { resolveArchitecture } from '../config';
import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

export function renderInspectProhibitionOutput(
  report: OperationalText,
  facts: ProhibitionReportFact[],
): OperationalText {
  return operationalText([report, renderProhibitionReport(facts)].filter(Boolean).join('\n'));
}

export function renderMustNotViolation(
  fact: { layer: string; id: string; description: string },
  check: MustNotCheck,
): string {
  const { layer, id, description } = fact;

  return `Layer "${layer}" prohibition "${id}": must not ${description}; `
    + `matched check ${JSON.stringify(check)}. `
    + ('call' in check
      ? 'This project-declared syntactic call check matches the terminal name, '
      + 'not semantic identity. '
      : '')
    + 'Move this behavior to a permitted layer or ask the architecture owner '
    + 'to revise the constraint.';
}

export function parseProhibitionIdentity(message: string): { layer: string; id: string } | null {
  const match = /^Layer "([^"]+)" prohibition "([a-z][a-z0-9-]*)": /.exec(message);

  return match ? { layer: match[1], id: match[2] } : null;
}

export function renderProhibitionPolicy(resolved: ResolvedArchitecture): string[] {
  return resolved.layers.some((layer) =>
    layer.prohibitions.some((item) => item.mode === 'executable'))
    ? [renderProhibitionSeverity()]
    : [];
}

export function renderProhibitionScope(
  architecture: ResolvedArchitecture,
  layer: string,
  framework: Framework = 'auto',
): string {
  if (!architecture.layers.find((entry) => entry.name === layer)?.prohibitions
    .some((entry) => entry.mode === 'executable')) {
    return '';
  }

  const files = architecture.prohibitionFiles(layer, framework);

  const ignores = [architecture.definition.layerFilesIgnore ?? []].flat()
    .concat(architecture.testFiles.architectureExemptions);

  return `Governed files: ${files.join(', ') || '(none)'}; ignores: `
    + `${ignores.join(', ') || '(none)'}. Reach: `
    + `${architecture.moduleRunway ? 'runway' : 'unmeasured'}; `
    + 'empty positions are not behavioral protection; Inspect measures current reach.';
}

export function renderCompactProhibitions(
  blueprint: Blueprint,
  detectedFramework?: 'react' | 'vue',
): string[] {
  const resolved = resolveArchitecture(blueprint.architecture, {
    framework: blueprint.framework === 'auto' ? detectedFramework : blueprint.framework,
    severity: blueprint.emit?.lint?.severity,
  });

  return renderProhibitionPolicy(resolved).flatMap((policy) => [
    `- Must-not doctrine: ${policy}`,
    ...resolved.layers.flatMap((layer) => layer.prohibitions.map((fact) =>
      `- ${layer.name}: ${renderProhibitionDetails(fact)}. `
      + renderProhibitionScope(resolved, layer.name, blueprint.framework))),
  ]);
}

export interface ProhibitionReportFact extends ResolvedProhibition {
  position?: string;
  files?: string[];
  ignores?: string[];
  matchedFiles?: string[];
  lintIntegration?: string;
  gate?: 'passed' | 'failed' | 'unverified';
  affectsExit?: boolean;
  reason?: string;
}

export function renderProhibitionLabel(fact: ResolvedProhibition): string {
  if (fact.mode === 'review-only') {
    return `${fact.description} [review only; no machine carrier]`;
  }

  const label = fact.status === 'active' ? 'lint backed' : fact.status;

  const availability = fact.status === 'active'
    ? 'available detectors; effective lint wiring must be verified separately'
    : 'gate evidence unverified; adoption completion blocked';

  return `${fact.id}: ${fact.description} [${label}; ${availability}; severity ${fact.severity}]`;
}

export function renderProhibitionDetails(fact: ResolvedProhibition): string {
  if (fact.mode === 'review-only') {
    return renderProhibitionLabel(fact);
  }

  return [
    renderProhibitionLabel(fact),
    ...fact.checks.map((entry) => `${JSON.stringify(entry.check)}: ${entry.status}`
      + `${entry.unavailableReason ? ` (${entry.unavailableReason})` : ''}`
      + `; limits: ${entry.limitations.join('; ')}`),
    `entry exemptions: ${fact.exempt.join(', ') || '(none)'}`,
    'checks use OR semantics; a passing detector is not proof of indirect semantic purity',
  ].join(' — ');
}

export function renderProhibitionSeverity(): string {
  return 'Error-severity executable matches are proven blocking violations (failed gate, '
    + 'affectsExit: true in the enforcing lint run). Warn-severity matches are visible '
    + 'non-blocking conformance observations (affectsExit: false), not failed gates. '
    + 'Partial or unavailable detectors yield unverified evidence and block adoption '
    + 'completion without inventing a violation or a new CLI exit policy. A proven missing, '
    + 'disabled, replaced, or mismatched required carrier is failed even at warn severity. '
    + 'Review-only prose remains the reviewer’s responsibility.';
}

export function renderProhibitionReport(facts: ProhibitionReportFact[]): string {
  if (!facts.length) {
    return '';
  }

  return [
    'Must-not prohibitions',
    renderProhibitionSeverity(),
    ...facts.flatMap((fact) => [
      `  ${fact.position ?? fact.layer}: ${renderProhibitionDetails(fact)}`,
      `    reach: ${fact.reach}; lint integration: ${fact.lintIntegration ?? 'unverified'}`
      + `${fact.gate ? `; gate: ${fact.gate}` : ''}`
      + `${fact.affectsExit === undefined ? '' : `; affectsExit: ${fact.affectsExit}`}`,
      `    files: ${(fact.files ?? []).join(', ') || '(unmeasured)'}`
      + `; ignores: ${(fact.ignores ?? []).join(', ') || '(none)'}`,
      ...(fact.reason ? [`    ${fact.reason}`] : []),
    ]),
    'Covered reach measures governed files, not absence of prohibited behavior. '
    + 'Vacuous positions and module runway are not behavioral protection. '
    + 'Static declarations do not establish a live source violation.',
  ].join('\n');
}

export function renderProhibitionDoctorMessage(fact: ProhibitionReportFact): string {
  return `${fact.position ?? fact.layer} / ${fact.id ?? 'review-only'}: ${fact.description}; `
    + `availability ${fact.status}; gate ${fact.gate ?? 'unverified'}; `
    + `lint integration ${fact.lintIntegration ?? 'unverified'}. `
    + `${fact.reason ?? 'Verify the exact normalized checks in the effective ESLint configuration.'}`
    + ` Checks: ${fact.checks.map((entry) => `${JSON.stringify(entry.check)}: ${entry.status}`
      + `${entry.unavailableReason ? ` (${entry.unavailableReason})` : ''}`).join('; ')}.`;
}
