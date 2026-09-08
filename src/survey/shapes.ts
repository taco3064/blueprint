import type { ScanResult } from '../inspect';
import type { RepeatedFolderShape } from './survey';

type ChildSets = Map<string, Set<string>>;

function collectByParent(scanResult: ScanResult): Map<string, ChildSets> {
  const byParent = new Map<string, ChildSets>();

  for (const file of scanResult.files) {
    const directories = file.segments.slice(0, -1);

    for (let index = 0; index + 1 < directories.length; index += 1) {
      addChild(byParent, {
        parent: directories.slice(0, index).join('/'),
        instance: directories[index],
        child: directories[index + 1],
      });
    }
  }

  return byParent;
}

function addChild(
  byParent: Map<string, ChildSets>,
  entry: { parent: string; instance: string; child: string },
): void {
  const { parent, instance, child } = entry;
  const instances = byParent.get(parent) ?? new Map<string, Set<string>>();
  const children = instances.get(instance) ?? new Set<string>();

  children.add(child);
  instances.set(instance, children);
  byParent.set(parent, instances);
}

function overlappingInstances(childSets: ChildSets): Map<string, Set<string>> {
  const names = [...childSets.keys()].sort((a, b) => a.localeCompare(b));
  const adjacency = new Map(names.map((name) => [name, new Set<string>()]));

  for (const [index, left] of names.entries()) {
    for (const right of names.slice(index + 1)) {
      if (overlaps(childSets.get(left)!, childSets.get(right)!)) {
        adjacency.get(left)!.add(right);
        adjacency.get(right)!.add(left);
      }
    }
  }

  return adjacency;
}

function overlaps(left: Set<string>, right: Set<string>): boolean {
  return [...left].some((child) => right.has(child));
}

function connectedGroups(adjacency: Map<string, Set<string>>): string[][] {
  const remaining = new Set(adjacency.keys());
  const groups: string[][] = [];

  while (remaining.size) {
    groups.push(takeGroup(remaining.values().next().value!, remaining, adjacency));
  }

  return groups.filter((group) => group.length > 1);
}

function takeGroup(
  first: string,
  remaining: Set<string>,
  adjacency: Map<string, Set<string>>,
): string[] {
  const pending = [first];
  const group: string[] = [];

  remaining.delete(first);

  while (pending.length) {
    const instance = pending.pop()!;

    group.push(instance);
    queueRemaining(adjacency.get(instance)!, remaining, pending);
  }

  return group.sort((a, b) => a.localeCompare(b));
}

function queueRemaining(
  siblings: Set<string>,
  remaining: Set<string>,
  pending: string[],
): void {
  for (const sibling of siblings) {
    if (remaining.delete(sibling)) {
      pending.push(sibling);
    }
  }
}

function repeatedChildren(instances: string[], childSets: ChildSets) {
  const names = new Set(instances.flatMap((instance) => [...childSets.get(instance)!]));

  return [...names]
    .map((folder) => ({
      folder,
      presentIn: instances.filter((instance) => childSets.get(instance)!.has(folder)).length,
      instanceCount: instances.length,
    }))
    .filter((child) => child.presentIn > 1)
    .sort((a, b) => b.presentIn - a.presentIn || a.folder.localeCompare(b.folder));
}

function displayedParent(relativeParent: string, sourceRoot: string): string {
  if (!relativeParent) {
    return sourceRoot;
  }

  return `${sourceRoot === '.' ? '' : `${sourceRoot}/`}${relativeParent}`;
}

export function measureRepeatedFolderShapes(
  scanResult: ScanResult,
  sourceRoot: string,
): RepeatedFolderShape[] {
  const shapes = [...collectByParent(scanResult)].flatMap(([parent, childSets]) =>
    connectedGroups(overlappingInstances(childSets)).map((instances) => ({
      parent: displayedParent(parent, sourceRoot),
      instances,
      repeatedChildren: repeatedChildren(instances, childSets),
    })),
  );

  return shapes.sort(
    (a, b) => a.parent.localeCompare(b.parent)
      || a.instances[0].localeCompare(b.instances[0]),
  );
}
