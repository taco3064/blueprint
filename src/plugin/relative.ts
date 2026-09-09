export type LayoutOf = (layer: string) => 'folder' | 'file';
export type EntryOf = (layer: string) => string;
export type RelativeVerdict = 'ok' | 'escapes-src' | 'leaves-layer' | 'reaches-inside';

export interface UnitShape {
  layoutOf: LayoutOf;
  entryOf: EntryOf;
  moduleFirst?: boolean;
}

export function unitKey(
  segments: string[],
  layoutOf: LayoutOf,
  moduleFirst = false,
): string {
  const layerIndex = moduleFirst ? 1 : 0;
  const unitIndex = layerIndex + 1;
  const layer = segments[layerIndex];

  if (!layer) {
    return segments[0] ?? '';
  }

  const prefix = segments.slice(0, unitIndex);

  if (segments.length <= unitIndex || layoutOf(layer) === 'file') {
    return prefix.join('/');
  }

  return [...prefix, segments[unitIndex].replace(/\.[^.]+$/, '')].join('/');
}

export function relativeVerdict(
  ownSegments: string[],
  target: string[] | null,
  shape: UnitShape,
): RelativeVerdict {
  const { layoutOf, entryOf, moduleFirst = false } = shape;

  if (target === null) {
    return 'escapes-src';
  }

  if (moduleFirst && ownSegments.length === 2) {
    return containerVerdict(ownSegments, target);
  }

  if (unitKey(target, layoutOf, moduleFirst) === unitKey(ownSegments, layoutOf, moduleFirst)) {
    return 'ok';
  }

  if (moduleFirst && target[0] !== ownSegments[0]) {
    return 'leaves-layer';
  }

  const layerIndex = moduleFirst ? 1 : 0;
  const unitIndex = layerIndex + 1;
  const layer = ownSegments[layerIndex];

  if (target[layerIndex] !== layer) {
    return 'leaves-layer';
  }

  return atUnitEntry(target, unitIndex, entryOf(layer)) ? 'ok' : 'reaches-inside';
}

function containerVerdict(ownSegments: string[], target: string[]): RelativeVerdict {
  if (target[0] !== ownSegments[0]) {
    return 'leaves-layer';
  }

  return target.length <= 2 ? 'ok' : 'leaves-layer';
}

function atUnitEntry(target: string[], unitIndex: number, entry: string): boolean {
  return target.length === unitIndex + 1
    || (target.length === unitIndex + 2
      && target[unitIndex + 1].replace(/\.[^.]+$/, '') === entry);
}

export function resolveSegments(dir: string[], specifier: string): string[] | null {
  const stack = [...dir];

  for (const part of specifier.split('/')) {
    if (part === '' || part === '.') {
      continue;
    }

    if (part === '..') {
      if (!stack.length) {
        return null;
      }

      stack.pop();
    } else {
      stack.push(part);
    }
  }

  return stack;
}
