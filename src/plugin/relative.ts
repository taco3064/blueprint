export type LayoutOf = (layer: string) => 'folder' | 'file';
export type EntryOf = (layer: string) => string;
export type RelativeVerdict = 'ok' | 'escapes-src' | 'leaves-layer' | 'reaches-inside';

export interface UnitShape {
  layoutOf: LayoutOf;
  entryOf: EntryOf;
  isLayer?: (name: string) => boolean;
  moduleFirst?: boolean;
  container?: boolean;
}

export function unitKey(
  segments: string[],
  layoutOf: LayoutOf,
  moduleFirst = false,
): string {
  const layerIndex = moduleFirst ? 1 : 0;
  const unitIndex = layerIndex + 1;
  const prefix = segments.slice(0, unitIndex);

  const layer = segments[layerIndex];

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
  // Stryker disable next-line ArrowFunction: false and undefined are equivalent under !isLayer().
  const { layoutOf, entryOf, isLayer = () => false, moduleFirst = false } = shape;

  if (target === null) {
    return 'escapes-src';
  }

  if (isContainerPosition(ownSegments, shape)) {
    return containerVerdict(ownSegments, target, isLayer);
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

function isContainerPosition(segments: string[], shape: UnitShape): boolean {
  return shape.moduleFirst === true && (segments.length === 2 || shape.container === true);
}

function containerVerdict(
  ownSegments: string[],
  target: string[],
  isLayer: (name: string) => boolean,
): RelativeVerdict {
  if (target[0] !== ownSegments[0]) {
    return 'leaves-layer';
  }

  if (ownSegments[0] === 'app') {
    return 'ok';
  }

  return target.length <= 2 && !isLayer(target[1] ?? '') ? 'ok' : 'leaves-layer';
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
