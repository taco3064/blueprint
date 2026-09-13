import type { ModuleDef } from './types';
import { renderValidationError } from '../operational-contract/validation-errors';

export interface ResolvedModule {
  definition: ModuleDef;
  name: string;
  root: string;
  dependsOn: string[];
  reachable: string[];
}

export function resolveModules(definitions: ModuleDef[], sourceRoot: string): ResolvedModule[] {
  const names = new Set(definitions.map((module) => module.name));

  const direct = new Map(definitions.map((module) => [
    module.name,
    validateDependencies(module, names),
  ]));

  assertAcyclicModules(definitions.map((module) => module.name), direct);

  return definitions.map((definition) => ({
    definition,
    name: definition.name,
    root: joinSource(sourceRoot, definition.name),
    dependsOn: [...direct.get(definition.name)!],
    reachable: reachableModules(definition.name, direct),
  }));
}

function validateDependencies(module: ModuleDef, names: Set<string>): string[] {
  const dependencies: string[] = [];
  const seen = new Set<string>();

  for (const dependency of module.dependsOn ?? []) {
    validateDependency({ module: module.name, dependency, names, seen });
    seen.add(dependency);
    dependencies.push(dependency);
  }

  return dependencies;
}

function validateDependency(scope: {
  module: string;
  dependency: string;
  names: Set<string>;
  seen: Set<string>;
}): void {
  const { module, dependency, names, seen } = scope;

  if (typeof dependency !== 'string' || !dependency.trim()) {
    throw new Error(renderValidationError({ kind: 'module-dependency-empty', module }));
  }

  if (dependency === module) {
    throw new Error(renderValidationError({ kind: 'module-self-dependency', module }));
  }

  if (seen.has(dependency)) {
    throw new Error(renderValidationError({
      kind: 'module-duplicate-dependency', module, dependency,
    }));
  }

  if (!names.has(dependency)) {
    throw new Error(renderValidationError({
      kind: 'module-unknown-dependency', module, dependency,
    }));
  }
}

function assertAcyclicModules(names: string[], direct: Map<string, string[]>): void {
  const complete = new Set<string>();
  const active = new Map<string, number>();
  // Stryker disable next-line ArrayDeclaration: a sentinel shifts active indexes equally.
  const path: string[] = [];

  const visit = (name: string): void => {
    // Stryker disable next-line ConditionalExpression, BlockStatement: revisits a proven DAG.
    if (complete.has(name)) {
      return;
    }

    complete.add(name);
    active.set(name, path.length);
    path.push(name);

    for (const dependency of direct.get(name)!) {
      const cycleStart = active.get(dependency);

      if (cycleStart !== undefined) {
        throw new Error(renderValidationError({
          kind: 'module-cycle', path: [...path.slice(cycleStart), dependency],
        }));
      }

      visit(dependency);
    }

    path.pop();
    active.delete(name);
  };

  for (const name of names) {
    visit(name);
  }
}

function reachableModules(name: string, direct: Map<string, string[]>): string[] {
  const reached = new Set<string>();

  const visit = (current: string): void => {
    for (const dependency of direct.get(current)!) {
      if (!reached.has(dependency)) {
        reached.add(dependency);
        visit(dependency);
      }
    }
  };

  visit(name);

  return [...reached];
}

function joinSource(sourceRoot: string, part: string): string {
  return sourceRoot === '.' ? part : `${sourceRoot}/${part}`;
}
