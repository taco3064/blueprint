export type LayoutOf = (layer: string) => 'folder' | 'flat';
export type EntryOf = (layer: string) => string;
export type RelativeVerdict = 'ok' | 'escapes-src' | 'leaves-layer' | 'reaches-inside';

export interface ModuleShape {
  layoutOf: LayoutOf;
  entryOf: EntryOf;
}

export function moduleKey(segments: string[], layoutOf: LayoutOf): string {
  if (segments.length < 2 || layoutOf(segments[0]) === 'flat') {
    return segments[0] ?? '';
  }

  return `${segments[0]}/${segments[1].replace(/\.[^.]+$/, '')}`;
}

export function relativeVerdict(
  ownSegments: string[],
  target: string[] | null,
  shape: ModuleShape,
): RelativeVerdict {
  const { layoutOf, entryOf } = shape;

  if (target === null) {
    return 'escapes-src';
  }

  if (moduleKey(target, layoutOf) === moduleKey(ownSegments, layoutOf)) {
    return 'ok';
  }

  const layer = ownSegments[0];

  if (target[0] !== layer) {
    return 'leaves-layer';
  }

  const entry = entryOf(layer);

  const atEntry = target.length === 2
    || (target.length === 3 && target[2].replace(/\.[^.]+$/, '') === entry);

  return atEntry ? 'ok' : 'reaches-inside';
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
