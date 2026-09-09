import { dependencyVerdict } from './dependency';
import type { ResolvedDependencyVerdict } from './dependency';
import type { AliasRoot } from './graph';
import type { ArchitectureDef } from './types';
import type { ResolvedArchitecture, ResolvedSourcePosition } from './resolved';

/** A resolved import target, its spelling, and the composed architecture verdict. */
export interface ResolvedImportReference {
  specifier: string;
  target: ResolvedSourcePosition | null;
  targetSegments: string[] | null;
  alias: string | null;
  kind: 'canonical-alias' | 'additional-alias' | 'relative' | 'external';
  canonicalSpecifier: string | null;
  crossesBoundary: boolean;
  dependency: ResolvedDependencyVerdict | null;
}

type ImportResolutionScope = {
  definition: ArchitectureDef;
  sourceSegments: string[];
  aliases: AliasRoot[];
  classify: ResolvedArchitecture['classify'];
  canImport: ResolvedArchitecture['canImport'];
  canImportModule: ResolvedArchitecture['canImportModule'];
};

export function resolveImportReference(
  importer: string | string[],
  specifier: string,
  scope: ImportResolutionScope,
): ResolvedImportReference {
  const importerPosition = scope.classify(importer);
  const alias = matchedAlias(scope.aliases, specifier, scope.definition.alias);
  const aliasTarget = resolveAliasTarget(alias, specifier);

  const { target, canonicalSpecifier } = resolveTarget({
    importer, specifier, importerPosition, aliasTarget, scope,
  });

  const dependency = importerPosition && target
    ? dependencyVerdict(importerPosition, target, scope)
    : null;

  return {
    specifier,
    target,
    targetSegments: aliasTarget ?? null,
    alias: alias?.alias ?? null,
    kind: importKind(alias, specifier, scope.definition.alias),
    canonicalSpecifier,
    crossesBoundary: crossesBoundary(importerPosition, target),
    dependency,
  };
}

function importKind(
  alias: AliasRoot | null,
  specifier: string,
  canonicalAlias: string,
): ResolvedImportReference['kind'] {
  if (!alias) {
    return specifier.startsWith('.') ? 'relative' : 'external';
  }

  return alias.alias === canonicalAlias ? 'canonical-alias' : 'additional-alias';
}

function resolveTarget(input: {
  importer: string | string[];
  specifier: string;
  importerPosition: ResolvedSourcePosition | null;
  aliasTarget: string[] | null | undefined;
  scope: ImportResolutionScope;
}): Pick<ResolvedImportReference, 'target' | 'canonicalSpecifier'> {
  const { importer, specifier, importerPosition, aliasTarget, scope } = input;

  if (aliasTarget !== undefined && importerPosition) {
    return {
      target: aliasTarget?.length ? scope.classify(aliasTarget) : null,
      canonicalSpecifier: aliasTarget === null
        ? null
        : [scope.definition.alias, ...aliasTarget].join('/'),
    };
  }

  if (!specifier.startsWith('.') || !importerPosition) {
    return { target: null, canonicalSpecifier: null };
  }

  const importerParts = Array.isArray(importer) ? importer : segments(importer);

  const relative = startsWith(importerParts, scope.sourceSegments)
    ? importerParts.slice(scope.sourceSegments.length)
    : importerParts;

  const resolved = resolveRelative(relative.slice(0, -1), specifier);

  return {
    target: resolved ? scope.classify(resolved) : null,
    canonicalSpecifier: null,
  };
}

function crossesBoundary(
  importer: ResolvedSourcePosition | null,
  target: ResolvedSourcePosition | null,
): boolean {
  return importer !== null && target !== null && boundaryKey(importer) !== boundaryKey(target);
}

function matchedAlias(
  aliases: AliasRoot[],
  specifier: string,
  canonicalAlias: string,
): AliasRoot | null {
  const canonical = aliases.find((candidate) => candidate.alias === canonicalAlias);

  if (canonical && matchesAlias(canonical, specifier)) {
    return canonical;
  }

  return aliases
    .filter((candidate) => matchesAlias(candidate, specifier))
    .sort((left, right) => right.alias.length - left.alias.length)[0] ?? null;
}

function matchesAlias(candidate: AliasRoot, specifier: string): boolean {
  return specifier === candidate.alias || specifier.startsWith(`${candidate.alias}/`);
}

function boundaryKey(position: ResolvedSourcePosition): string | null {
  if (position.kind === 'source-root') {
    return null;
  }

  const module = position.module?.name ?? null;

  const inner = position.kind === 'module' || position.kind === 'container'
    ? 'container'
    : position.layer.name;

  return `${module ?? ''}:${inner}`;
}

function segments(value: string): string[] {
  return value.split(/[\\/]/).filter((part) => part !== '' && part !== '.');
}

function startsWith(parts: string[], prefix: string[]): boolean {
  return prefix.every((part, index) => parts[index] === part);
}

function resolveAliasTarget(
  root: AliasRoot | null,
  specifier: string,
): string[] | null | undefined {
  if (!root) {
    return undefined;
  }

  const parts = specifier.slice(root.alias.length).split('/').filter(Boolean);

  if (!startsWith(parts, root.prefix)) {
    return null;
  }

  return [...(root.prepend ?? []), ...parts.slice(root.prefix.length)];
}

function resolveRelative(from: string[], specifier: string): string[] | null {
  const result = [...from];

  for (const part of specifier.split('/')) {
    if (part === '' || part === '.') {
      continue;
    }

    if (part === '..') {
      if (result.pop() === undefined) {
        return null;
      }
    } else {
      result.push(part);
    }
  }

  return result;
}
