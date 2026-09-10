import { describe, expect, it } from 'vitest';

import { reactPreset } from '../presets';
import type { SurveyResult } from '../survey';
import { decideTopology, observeTopology } from './topology';

function survey(overrides: Partial<SurveyResult> = {}): SurveyResult {
  return {
    framework: 'react',
    typescript: true,
    packageManager: 'npm',
    sourceRoot: 'src',
    aliases: {},
    rootFiles: [],
    folders: [],
    repeatedFolderShapes: [],
    edges: [],
    selfAliasImports: {},
    testEvidence: [],
    packageUsage: [],
    ownableImports: [],
    unresolved: [],
    totalFiles: 4,
    ...overrides,
  };
}

function folder(folder: string, children: string[] = []) {
  return {
    folder,
    files: 2,
    directFiles: children.length ? 0 : 2,
    childFolders: children.length,
    children,
    indexedChildren: 0,
    maxDepth: children.length ? 2 : 1,
  };
}

describe('observeTopology', () => {
  it('reports missing configuration and survey evidence as not provable', () => {
    expect(observeTopology(null, null)).toEqual({
      current: null,
      source: 'not-provable',
      selectedApplication: null,
      uncertainty: 'insufficient',
    });
  });

  it('takes configured topology as authoritative over contradictory survey evidence', () => {
    const layerFirst = reactPreset().architecture;

    const moduleFirst = {
      ...reactPreset().architecture,
      modules: [{ name: 'auth', does: 'authentication' }],
    };

    const moduleShaped = survey({
      folders: [folder('auth', ['hooks']), folder('checkout', ['hooks'])],
      repeatedFolderShapes: [{
        parent: 'src',
        instances: ['auth', 'checkout'],
        repeatedChildren: [{ folder: 'hooks', presentIn: 2, instanceCount: 2 }],
      }],
    });

    expect(observeTopology(layerFirst, moduleShaped)).toMatchObject({
      current: 'layer-first', source: 'configured', selectedApplication: 'src',
    });

    expect(observeTopology(moduleFirst, survey({
      folders: [folder('pages'), folder('containers')],
    }))).toMatchObject({ current: 'module-first', source: 'configured' });
  });

  it('classifies a direct technical layer axis only with a strong root and no module axis', () => {
    expect(observeTopology(null, survey({
      folders: [folder('pages'), folder('components')],
    }))).toMatchObject({ current: 'layer-first', source: 'classified' });

    for (const folders of [
      [folder('app')],
      [folder('components')],
      [folder('auth'), folder('checkout')],
    ]) {
      expect(observeTopology(null, survey({ folders }))).toMatchObject({
        current: null, source: 'not-provable',
      });
    }

    expect(observeTopology(null, survey({
      sourceRoot: undefined,
      folders: [folder('pages'), folder('components')],
    })).selectedApplication).toBe('src');
  });

  it('classifies repeated and import-supported module axes with recognized inner layers', () => {
    const folders = [folder('auth', ['hooks']), folder('checkout', ['services'])];

    expect(observeTopology(null, survey({
      folders: [folder('auth', ['hooks']), folder('checkout', ['hooks'])],
      repeatedFolderShapes: [{
        parent: 'src',
        instances: ['auth', 'checkout'],
        repeatedChildren: [{ folder: 'hooks', presentIn: 2, instanceCount: 2 }],
      }],
    }))).toMatchObject({ current: 'module-first', source: 'classified' });

    expect(observeTopology(null, survey({
      folders,
      repeatedFolderShapes: undefined,
      edges: [{ from: 'auth', to: 'checkout', count: 1 }],
    }))).toMatchObject({ current: 'module-first', source: 'classified' });

    expect(observeTopology(null, survey({
      folders: [{ ...folder('auth'), children: undefined }],
    })).current).toBeNull();
  });
});

describe('observeTopology edge cases', () => {
  it('leaves mixed, empty, unresolved, nested-only, and generic shapes unknown', () => {
    const mixed = survey({
      folders: [
        folder('pages'),
        folder('components'),
        folder('auth', ['hooks']),
        folder('checkout', ['hooks']),
      ],
      repeatedFolderShapes: [{
        parent: 'src',
        instances: ['auth', 'checkout'],
        repeatedChildren: [{ folder: 'hooks', presentIn: 2, instanceCount: 2 }],
      }],
    });

    const nested = survey({
      folders: [folder('features', ['auth', 'checkout'])],
      repeatedFolderShapes: [{
        parent: 'src/features',
        instances: ['auth', 'checkout'],
        repeatedChildren: [{ folder: 'hooks', presentIn: 2, instanceCount: 2 }],
      }],
    });

    const generic = survey({
      folders: [folder('auth', ['internal']), folder('checkout', ['internal'])],
      repeatedFolderShapes: [{
        parent: 'src',
        instances: ['auth', 'checkout'],
        repeatedChildren: [{ folder: 'internal', presentIn: 2, instanceCount: 2 }],
      }],
    });

    for (const evidence of [
      mixed,
      nested,
      generic,
      survey({ totalFiles: 0 }),
      survey({ sourceRoot: undefined, totalFiles: 0 }),
      survey({ sourceRoot: undefined, folders: [folder('app')] }),
      survey({ totalFiles: 0, scopeRequired: true }),
    ]) {
      expect(observeTopology(null, evidence).current).toBeNull();
    }
  });
});

describe('decideTopology', () => {
  it('repairs configured topology and routes unconfigured module-first through authoring', () => {
    const configured = { current: 'layer-first' as const, source: 'configured' as const,
      selectedApplication: 'src' };

    const classified = { current: 'module-first' as const, source: 'classified' as const,
      selectedApplication: 'src' };

    expect(decideTopology(configured)).toMatchObject({
      operation: 'repair', target: 'layer-first', path: 'scaffold',
    });

    expect(decideTopology(classified)).toMatchObject({
      operation: 'adopt', target: 'module-first', path: 'authoring',
    });
  });

  it('initializes an empty tree only when the topology is explicit', () => {
    const unknown = { current: null, source: 'not-provable' as const,
      selectedApplication: null };

    expect(decideTopology(unknown)).toMatchObject({
      operation: 'abort', path: null,
    });

    expect(decideTopology(unknown, { topology: 'layer-first' })).toMatchObject({
      operation: 'initialize', path: 'scaffold',
    });

    expect(decideTopology(unknown, { topology: 'module-first' })).toMatchObject({
      operation: 'initialize', path: 'authoring',
    });
  });

  it('requires transformation for mismatches and ambiguous non-empty trees', () => {
    const layerFirst = { current: 'layer-first' as const, source: 'classified' as const,
      selectedApplication: 'src' };

    const unknown = { current: null, source: 'not-provable' as const,
      selectedApplication: 'src', uncertainty: 'insufficient' as const };

    expect(decideTopology(layerFirst, { topology: 'module-first' })).toMatchObject({
      operation: 'transformation-required', path: null,
    });

    expect(decideTopology(unknown, { topology: 'layer-first' })).toMatchObject({
      operation: 'adopt', path: 'scaffold',
    });

    expect(decideTopology({ ...unknown, uncertainty: 'scope' }, { topology: 'module-first' }))
      .toMatchObject({ operation: 'abort', path: null });

    expect(decideTopology({ ...unknown, uncertainty: 'mixed' }, { topology: 'layer-first' }))
      .toMatchObject({ operation: 'transformation-required', path: null });

    expect(decideTopology({ ...unknown, uncertainty: 'mixed' }))
      .toMatchObject({ operation: 'abort', path: null });
  });

  it('treats preset as a layer-first target in every current and explicit combination', () => {
    const inferredLayer = { current: 'layer-first' as const, source: 'classified' as const,
      selectedApplication: 'src' };

    const inferredModule = { current: 'module-first' as const, source: 'classified' as const,
      selectedApplication: 'src' };

    expect(decideTopology(inferredModule, { preset: true })).toMatchObject({
      target: 'layer-first', operation: 'transformation-required', path: null,
    });

    expect(decideTopology(inferredLayer, { preset: true })).toMatchObject({
      target: 'layer-first', operation: 'adopt', path: 'scaffold',
    });

    expect(decideTopology(inferredLayer, {
      topology: 'layer-first', preset: true,
    })).toMatchObject({ target: 'layer-first', operation: 'adopt', path: 'scaffold' });

    expect(decideTopology(inferredLayer, {
      topology: 'module-first', preset: true,
    })).toMatchObject({ target: 'module-first', operation: 'abort', path: null });
  });
});
