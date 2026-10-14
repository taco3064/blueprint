import { resolveArchitecture } from '../config';
import type { Blueprint } from '../config';
import { dropTestFiles, globToRegExp } from './filter';
import type { ScanResult } from './types';

export function sourceRootProbeSites(
  blueprint: Blueprint,
  scanResult: ScanResult,
  ignores: string[],
): { layer: null; globs: string[]; hit: string }[] {
  const resolved = resolveArchitecture(blueprint.architecture);

  if (resolved.topology !== 'module-first') {
    return [];
  }

  const globs = resolved.sourceRootFiles(blueprint.framework);
  const nets = globs.map(globToRegExp);
  const held = ignores.map(globToRegExp);
  const source = dropTestFiles(scanResult, blueprint.architecture.testFiles).files;

  const hit = source.find((file) =>
    // Stryker disable next-line MethodExpression: sourceRootFiles always supplies exactly one glob.
    nets.some((net) => net.test(file.path))
    && !held.some((ignore) => ignore.test(file.path)));

  return hit ? [{ layer: null, globs, hit: hit.path }] : [];
}

export function sourceRootWiringEvidence(blueprint: Blueprint, actual: string | null) {
  return {
    lost: actual === JSON.stringify(blueprint.architecture)
      ? []
      : ['source-root: blueprint/import-boundary is missing, off, '
        + 'or its architecture policy was weakened'],
    unreadable: 0,
  };
}
