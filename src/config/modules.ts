import type { ModuleDef } from './types';

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
    throw new Error(`Module "${module}" has a dependsOn entry with no module name.`);
  }

  if (dependency === module) {
    throw new Error(`Module "${module}" cannot depend on itself.`);
  }

  if (seen.has(dependency)) {
    throw new Error(`Module "${module}" lists direct dependency "${dependency}" more than once.`);
  }

  if (!names.has(dependency)) {
    throw new Error(
      `Module "${module}" depends on unknown module "${dependency}" — `
      + 'declare that module in architecture.modules or remove the edge.',
    );
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
        throw new Error(
          `architecture.modules dependency cycle: ${[
            ...path.slice(cycleStart), dependency,
          ].join(' → ')}.`,
        );
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
