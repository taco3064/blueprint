import { describe, expect, it } from 'vitest';
import { layoutResolver } from '../boundary';
import type { ArchitectureDef } from '../config';
import { targetModuleKey } from './resolve';
import type { ImportRef, ScannedFile } from './types';

const architecture: ArchitectureDef = {
  alias: '~app',
  module: { layout: 'folder', entry: 'index' },
  layers: [
    { name: 'resources', does: 'feature modules' },
    { name: 'services', does: 'io', module: { entry: 'service' } },
    { name: 'utils', does: 'leaf helpers', module: { layout: 'flat' } },
  ],
};

const layoutOf = layoutResolver(architecture);

describe('targetModuleKey · which specifiers name a module', () => {
  const file = (segments: string[]): ScannedFile => ({ path: segments.join('/'), segments, imports: [] });
  const ref = (specifier: string): ImportRef => ({ specifier, names: [], isExport: false });

  it('answers null for a bare package specifier', () => {
    // A package name is neither aliased nor relative. Resolving it like a
    // relative path appends it to the importer's own folder, and `axios` becomes
    // the module `resources/axios` — a graph edge to a module that is not there,
    // counted in every blast radius and flow check.
    expect(
      targetModuleKey(ref('axios'), file(['resources', 'Row', 'Row.ts']), ['~app'], ['resources'], layoutOf),
    ).toBeNull();

    // The two shapes that DO name a module still do.
    expect(
      targetModuleKey(ref('./parts/Cell'), file(['resources', 'Row', 'Row.ts']), ['~app'], ['resources'], layoutOf),
    ).toBe('resources/Row');

    expect(
      targetModuleKey(ref('~app/services/api'), file(['resources', 'Row', 'Row.ts']), ['~app'], ['services'], layoutOf),
    ).toBe('services/api');
  });
});
