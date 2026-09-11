import type { ResolvedArchitecture, ResolvedSourcePosition } from './resolved';

export interface ResolvedDependencyEndpoint {
  module: string | null;
  position: 'container' | string;
}

export interface ResolvedDependencyVerdict {
  allowed: boolean;
  module: boolean;
  inner: boolean;
  importer: ResolvedDependencyEndpoint;
  target: ResolvedDependencyEndpoint;
}

export function dependencyVerdict(
  importer: ResolvedSourcePosition,
  target: ResolvedSourcePosition,
  rules: {
    canImport: ResolvedArchitecture['canImport'];
    canImportModule: ResolvedArchitecture['canImportModule'];
  },
): ResolvedDependencyVerdict | null {
  const from = dependencyEndpoint(importer);
  const to = dependencyEndpoint(target);

  if (!from || !to) {
    return null;
  }

  // Stryker disable next-line ConditionalExpression: layer-first makes both modules null.
  const moduleAllowed = from.module === null
    || to.module === null
    || rules.canImportModule(from.module, to.module);

  // Stryker disable next-line ConditionalExpression: containers cannot match an inner layer.
  const targetIsInner = to.position !== 'container';

  const innerAllowed = from.position === 'container'
    || (targetIsInner
      && (from.position === to.position || rules.canImport(from.position, to.position)));

  return {
    allowed: moduleAllowed && innerAllowed,
    module: moduleAllowed,
    inner: innerAllowed,
    importer: from,
    target: to,
  };
}

function dependencyEndpoint(
  position: ResolvedSourcePosition,
): ResolvedDependencyEndpoint | null {
  if (position.kind === 'source-root') {
    return null;
  }

  if (position.kind === 'module' || position.kind === 'container') {
    return { module: position.module.name, position: 'container' };
  }

  return { module: position.module?.name ?? null, position: position.layer.name };
}
