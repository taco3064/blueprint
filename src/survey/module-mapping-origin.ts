import path from 'node:path';

import type { LayerToModuleObligation } from '../project';
import type { LayerMappingCandidate } from './module-mapping';

type Restoration = Pick<
  LayerMappingCandidate, 'destination' | 'restoration' | 'originUnit' | 'reason'
>;

type MemberClaim = {
  unit: string;
  source: string;
  destination: string;
  declared: boolean;
};

export function originContainerUnits(
  origin: LayerToModuleObligation | null | undefined,
  sourceRoot: string,
): Map<string, Restoration> {
  const result = new Map<string, Restoration>();

  if (!origin) {
    return result;
  }

  const claims = origin.target.decisions.flatMap((decision) => decision.members.map((member) => ({
    unit: decision.source,
    ...member,
    declared: decision.destinations.includes(member.destination),
  })));

  for (const claim of claims) {
    const destination = relocate(claim.destination, origin.origin.sourceRoot, sourceRoot);

    if (destination === null) {
      continue;
    }

    const reason = invalidClaim(claim, claims, origin);
    const source = relocate(claim.source, origin.origin.sourceRoot, sourceRoot);

    result.set(destination, reason
      ? { restoration: 'requires-decision', reason }
      : { restoration: 'restored-from-origin', originUnit: claim.unit, destination: source! });
  }

  return result;
}

export function rootRestoration(input: {
  source: string;
  fallback: string;
  origin: LayerToModuleObligation | null | undefined;
  recorded: Map<string, Restoration>;
}): Restoration {
  if (!input.origin) {
    return { destination: input.fallback, restoration: 'fallback-no-origin' };
  }

  return input.recorded.get(input.source)
    ?? { restoration: 'requires-decision', reason: 'unmapped-origin-member' };
}

function invalidClaim(
  claim: MemberClaim,
  claims: MemberClaim[],
  origin: LayerToModuleObligation,
): string | null {
  const sources = origin.origin.sources.filter((source) => source.unit === claim.unit);

  if (sources.length !== 1 || sources[0].role !== 'container-seed') {
    return 'unproven-origin-unit';
  }

  const recordedMembers = origin.origin.sources.flatMap((source) => source.members);

  if (!sources[0].members.includes(claim.source)
    || recordedMembers.filter((member) => member === claim.source).length !== 1) {
    return 'unproven-origin-member';
  }

  if (!claim.declared || claims.filter((member) => member.source === claim.source).length !== 1
    || claims.filter((member) =>
      identity(member.destination) === identity(claim.destination)).length !== 1) {
    return 'ambiguous-member-mapping';
  }

  return invalidUnitAddress(claim, origin);
}

function invalidUnitAddress(
  claim: MemberClaim,
  origin: LayerToModuleObligation,
): string | null {
  const layer = origin.origin.layers?.find((candidate) => candidate.name === 'containers');

  if (!layer) {
    return 'missing-origin-layer';
  }

  const relative = relocate(claim.source, origin.origin.sourceRoot, '.');

  if (relative === null || !claim.unit.startsWith('containers/')) {
    return 'unsafe-origin-member';
  }

  const matchesUnit = layer.layout !== 'folder'
    ? relative.slice(0, -path.posix.extname(relative).length) === claim.unit
    : relative.startsWith(`${claim.unit}/`);

  return matchesUnit ? null : 'origin-unit-member-mismatch';
}

function relocate(file: string, previousRoot: string, nextRoot: string): string | null {
  if (path.posix.isAbsolute(file) || path.posix.normalize(file) !== file
    || file.startsWith('../')) {
    return null;
  }

  const prefix = previousRoot === '.' ? '' : `${previousRoot}/`;

  if (!file.startsWith(prefix)) {
    return null;
  }

  const relative = file.slice(prefix.length);

  return nextRoot === '.' ? relative : `${nextRoot}/${relative}`;
}

function identity(file: string): string {
  return path.posix.normalize(file).toLocaleLowerCase('en-US');
}
