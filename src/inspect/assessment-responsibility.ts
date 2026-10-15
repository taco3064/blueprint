import { renderAssessmentClaim, renderAssessmentNextStep } from '../operational-contract';
import type { AssessmentItem, Blueprint } from '../config';
import type { ArchitectureFacts } from './facts';
import { dropLayerFilesIgnored } from './filter';
import { compareText } from './order';

export function responsibilityItems(
  application: string, blueprint: Blueprint, facts: ArchitectureFacts,
): AssessmentItem[] {
  const paths = dropLayerFilesIgnored(
    { ...facts.scanResult, files: facts.governedFiles }, blueprint.architecture.layerFilesIgnore,
  ).files.map((file) => file.path).sort(compareText);

  const positions = facts.resolved.layerPositions.map((position) => ({
    position: position.root,
    does: position.layer.definition.does,
    files: paths.filter((file) => file.startsWith(`${position.root}/`)),
  }));

  const items = positions.map((evidence) => reviewItem(application, {
    id: 'layer-responsibility', sourceKey: evidence.position, evidence,
    occupied: evidence.files.length > 0,
  }));

  if (facts.resolved.moduleRunway) {
    items.push({
      ...reviewItem(application, {
        id: 'module-runway', sourceKey: facts.resolved.sourceRoot, occupied: false,
        evidence: { layers: facts.resolved.layers.map((layer) => ({
          name: layer.name, does: layer.definition.does,
        })) },
      }),
      reach: 'runway',
    });
  }

  for (const root of facts.resolved.rootUnits) {
    const unit = root.resolve(paths, blueprint.framework);

    const layers = positions.filter((position) =>
      position.position.startsWith(`${root.root}/`) && position.files.length > 0,
    );

    if (unit !== null) {
      items.push(reviewItem(application, {
        id: 'module-root-responsibility', sourceKey: root.root, occupied: true,
        evidence: { module: root.module.name, root: root.root, ...unit,
          guidance: 'owner-review', destination: null },
      }));
    }

    if (!paths.some((file) => file.startsWith(`${root.root}/`))) {
      continue;
    }

    items.push(ownershipItem(application, facts, { root, unit, layers }));
  }

  return items;
}

function reviewItem(application: string, input: {
  id: string; sourceKey: string; evidence: unknown; occupied: boolean;
}): AssessmentItem {
  return {
    id: input.id, application, subject: input.sourceKey, sourceKey: input.sourceKey,
    lane: input.occupied ? 'review' : 'reach',
    status: input.occupied ? 'review-required' : 'declaratory',
    claim: renderAssessmentClaim(input.id), source: 'resolved-architecture',
    evidence: input.evidence,
    reach: input.occupied ? 'covered' : 'vacuous',
    limitations: ['semantic-responsibility-not-machine-proven'], signals: [], affectsExit: false,
    nextStep: input.occupied ? renderAssessmentNextStep('review-responsibility') : null,
  };
}

function ownershipItem(application: string, facts: ArchitectureFacts,
  input: { root: ArchitectureFacts['resolved']['rootUnits'][number];
    unit: ReturnType<ArchitectureFacts['resolved']['rootUnits'][number]['resolve']>;
    layers: { position: string; does: string; files: string[] }[]; }): AssessmentItem {
  const { root, unit, layers } = input;

  const dependencies = facts.moduleDependencies!.modules.find((row) =>
    row.name === root.module.name,
  )!;

  const incoming = facts.moduleDependencies!.modules.filter((row) =>
    row.observedDirect.some((edge) => edge.to === root.module.name),
  ).length;

  const outgoing = dependencies.observedDirect.length;

  const signals = [
    ...(incoming > 1 ? ['multiple-observed-consumers'] : []),
    ...(incoming > 0 && outgoing === 0 ? ['dependency-base'] : []),
    ...(unit !== null ? ['root-source-present'] : []),
    ...(dependencies.missingDeclarations.length > 0 || dependencies.unusedDeclarations.length > 0
      ? ['dependency-drift']
      : []),
    ...(dependencies.uncertainty.length > 0 ? ['analysis-indeterminate'] : []),
  ];

  return {
    ...reviewItem(application, {
      id: 'module-ownership', sourceKey: root.root, occupied: true,
      evidence: { module: root.module.name, root: root.root, does: root.module.definition.does,
        rootUnit: unit, layers, dependencies, incoming, outgoing },
    }),
    signals,
  };
}
