import path from 'node:path';
import { resolveArchitecture } from '../config';
import type {
  Blueprint, ResolvedRootUnit, ResolvedImportReference, ResolvedArchitecture,
} from '../config';
import { renderFindingMessage } from '../operational-contract';
import type { Finding, ScanResult, ScannedFile } from './types';

export function rootUnitFindings(
  scan: ScanResult, blueprint: Blueprint, resolved = resolveArchitecture(blueprint.architecture),
): Finding[] {
  const paths = scan.files.map((file) => file.path);

  return resolved.rootUnits.flatMap((root): Finding[] => {
    const unit = root.resolve(paths, blueprint.framework);
    const structural = unit === null ? [] : structuralFindings(root, unit, { scan, resolved });

    const imports = rootImportFindings(scan, blueprint, {
      root, entry: unit?.entry ?? null, resolved,
    });

    return [...structural, ...imports];
  });
}

function structuralFindings(
  root: ResolvedRootUnit,
  unit: NonNullable<ReturnType<ResolvedRootUnit['resolve']>>,
  scope: { scan: ScanResult; resolved: ResolvedArchitecture },
): Finding[] {
  if (unit.entries.length === 0) {
    return [{
      severity: 'warn', rule: 'no-entry', path: root.root, subject: '',
      message: renderFindingMessage({ kind: 'root-no-entry', unit: root.module.name }),
    }];
  }

  if (unit.entry === null) {
    return [{
      severity: 'error', rule: 'ambiguous-root-entry', path: root.root, subject: '',
      message: renderFindingMessage({ kind: 'ambiguous-root-entry', entries: unit.entries }),
    }];
  }

  const members = scope.scan.files.filter((file) => unit.members.includes(file.path));
  const reach = reachableMembers(unit.entry, members, scope.resolved);

  if (reach.limitations.length) {
    return reach.limitations.map((file) => ({
      severity: 'warn', rule: 'root-reachability-unknown', path: file.path,
      subject: root.module.name,
      message: renderFindingMessage({ kind: 'root-reachability-unknown', unit: root.module.name }),
    }));
  }

  return members.filter((file) => !reach.visited.has(file.path)).map((file) => ({
    severity: 'error', rule: 'orphan-root-file', path: file.path, subject: '',
    message: renderFindingMessage({ kind: 'orphan-root-file', entry: unit.entry! }),
  }));
}

function reachableMembers(
  entry: string, members: ScannedFile[], resolved: ResolvedArchitecture,
): {
  visited: Set<string>;
  limitations: ScannedFile[];
} {
  const visited = new Set<string>([entry]);
  const limitations: ScannedFile[] = [];
  const queue = [entry];
  const byPath = new Map(members.map((file) => [file.path, file]));

  members.forEach(() => {
    const current = queue.shift();

    if (current === undefined) {
      return;
    }

    const file = byPath.get(current)!;

    const incomplete = file.importAnalysis?.parseError
      || file.importAnalysis?.unknownDynamicImports
      || file.unknownModuleSpecifiers;

    limitations.push(...(incomplete ? [file] : []));

    for (const target of memberTargets(file, members, { limitations, resolved })) {
      if (!visited.has(target)) {
        visited.add(target);
        queue.push(target);
      }
    }
  });

  return { visited, limitations };
}

function memberTargets(
  file: ScannedFile, members: ScannedFile[],
  scope: { limitations: ScannedFile[]; resolved: ResolvedArchitecture },
): string[] {
  const targets: string[] = [];

  for (const specifier of sourceSpecifiers(file)) {
    const target = memberTarget(file, specifier, scope.resolved);

    if (target === null) {
      continue;
    }

    const matches = resolveMemberTarget(target, members);

    if (matches.length > 1) {
      scope.limitations.push(file);
    }

    targets.push(...matches.map((member) => member.path));
  }

  return targets;
}

function rootImportFindings(
  scan: ScanResult,
  blueprint: Blueprint,
  unit: { root: ResolvedRootUnit; entry: string | null; resolved: ResolvedArchitecture },
): Finding[] {
  const { root, entry, resolved } = unit;

  return scan.files.flatMap((file) => sourceSpecifiers(file).flatMap((specifier): Finding[] => {
    const reference = resolved.resolveImport(file.segments, specifier);
    const boundary = reference.rootUnit;

    if (!boundary || boundary.target.module.name !== root.module.name) {
      return [];
    }

    const at = { path: file.path, subject: specifier };

    if (boundary.sameUnit && reference.kind !== 'relative') {
      return [{
        severity: 'error', rule: 'flow-violation', ...at,
        message: renderFindingMessage({ kind: 'same-layer-alias', subject: specifier }),
      }];
    }

    if (!boundary.sameUnit && !boundary.bare) {
      return [{
        severity: 'error', rule: 'deep-import', ...at,
        message: renderFindingMessage({
          kind: 'deep-import', subject: specifier,
          ...(reference.dependency?.allowed
            ? { canonicalSpecifier: `${blueprint.architecture.alias}/${root.module.name}` }
            : {}),
        }),
      }];
    }

    if (requiresCanonical(reference, resolved, file)) {
      return [{
        severity: 'error', rule: 'canonical-alias', ...at,
        message: renderFindingMessage({
          kind: 'root-canonical-alias', subject: specifier,
          canonicalSpecifier: `${blueprint.architecture.alias}/${root.module.name}`,
        }),
      }];
    }

    return boundary.bare && entry === null
      ? [{
          severity: 'error', rule: 'missing-root-entry', ...at,
          message: renderFindingMessage({ kind: 'missing-root-entry', subject: specifier }),
        }]
      : [];
  }));
}

function sourceSpecifiers(file: ScannedFile): string[] {
  return file.moduleSpecifiers ?? file.imports.map((ref) => ref.specifier);
}

function requiresCanonical(
  reference: ResolvedImportReference,
  resolved: ResolvedArchitecture,
  file: ScannedFile,
): boolean {
  return !reference.rootUnit!.sameUnit && reference.kind !== 'canonical-alias'
    && (reference.kind === 'relative' || resolved.classify(file.segments)!.kind === 'source-root');
}

function resolveMemberTarget(target: string, members: ScannedFile[]): ScannedFile[] {
  // Stryker disable next-line ArrayDeclaration: a non-path cannot match governed source paths.
  const noSubstitutions: string[] = [];

  const substitutions = target.endsWith('.js')
    ? [target.replace(/\.js$/, '.ts'), target.replace(/\.js$/, '.tsx')]
    : target.endsWith('.jsx')
      ? [target.replace(/\.jsx$/, '.tsx')]
      : noSubstitutions;

  const candidates = members.filter((member) => member.path === target
    || substitutions.includes(member.path));

  return candidates.length
    ? candidates
    : members.filter((member) =>
        member.path.replace(/\.[^.]+$/, '') === target);
}

function memberTarget(
  file: ScannedFile, specifier: string, resolved: ResolvedArchitecture,
): string | null {
  if (specifier.startsWith('.')) {
    return path.posix.normalize(path.posix.join(path.posix.dirname(file.path), specifier));
  }

  const reference = resolved.resolveImport(file.segments, specifier);
  const boundary = reference.rootUnit;

  if (!boundary?.sameUnit) {
    return null;
  }

  const member = boundary.bare
    ? boundary.target.entry
    : reference.targetSegments!.slice(1).join('/');

  return `${boundary.target.root}/${member}`;
}
