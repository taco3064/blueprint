import { describe, expect, it } from 'vitest';

import { defineBlueprint, resolveArchitecture } from '../config';
import { analyze } from './analyze';
import { buildUnitGraph, positionKey } from './resolve';
import type { ImportRef, ScanResult, ScannedFile } from './types';

const blueprint = defineBlueprint({
  framework: 'react',
  architecture: {
    alias: '~app',
    modules: [
      { name: 'auth', does: 'identity application', dependsOn: ['shop'] },
      { name: 'shop', does: 'commerce application' },
    ],
    layers: [
      { name: 'components', does: 'UI', layout: 'folder', entry: 'index' },
      { name: 'hooks', does: 'state', layout: 'file' },
      { name: 'services', does: 'I/O', layout: 'folder', entry: 'index', owns: ['axios'] },
    ],
  },
});

function file(segments: string[], specifiers: string[] = []): ScannedFile {
  const imports: ImportRef[] = specifiers.map((specifier) => ({
    specifier,
    names: [],
    isExport: false,
  }));

  return { path: ['src', ...segments].join('/'), segments, imports };
}

function scan(files: ScannedFile[], topDirs = ['auth', 'shop']): ScanResult {
  return { files, topDirs };
}

describe('inspect consumers · module-first topology', () => {
  it('classifies nested app router source consistently and preserves module reachability', () => {
    const routerBlueprint = defineBlueprint({
      ...blueprint,
      architecture: {
        ...blueprint.architecture,
        modules: [
          { name: 'app', does: 'router composition', dependsOn: ['auth'] },
          { name: 'auth', does: 'identity application' },
          { name: 'shop', does: 'commerce application' },
        ],
      },
    });

    const graph = buildUnitGraph(scan([
      file(['app', 'dashboard', 'page.tsx'], ['~app/auth/services/api']),
      file(['auth', 'services', 'api', 'index.ts']),
    ], ['app', 'auth']), routerBlueprint.architecture);

    expect(graph.units).toContain('app');
    expect(graph.edges.get('app')).toEqual(new Set(['auth/services/api']));

    const findings = analyze(scan([
      file(['app', 'dashboard', 'page.tsx'], [
        '~app/auth/services/api',
        '~app/shop/services/api',
        '../settings/routes',
        '../../../auth/index',
      ]),
      file(['app', 'settings', 'account', 'page.tsx']),
      file(['auth', 'random', 'x.ts']),
    ], ['app']), routerBlueprint);

    expect(findings.some((finding) => finding.subject === '~app/auth/services/api')).toBe(false);
    expect(findings.some((finding) => finding.subject === '~app/shop/services/api')).toBe(true);
    expect(findings.some((finding) => finding.subject === '../settings/routes')).toBe(false);
    expect(findings.some((finding) => finding.subject === '../../../auth/index')).toBe(true);

    expect(findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'undeclared-folder', path: 'src/app/dashboard' }),
      expect.objectContaining({ rule: 'undeclared-folder', path: 'src/app/settings' }),
      expect.objectContaining({ rule: 'no-entry', path: expect.stringMatching(/^src\/app\//) }),
    ]));

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'undeclared-folder', path: 'src/auth/random' }),
    ]));
  });

  it('reports undeclared outer modules and missing folder-unit entries at full identity', () => {
    const findings = analyze(scan([
      file(['auth', 'components', 'Login', 'Login.tsx']),
      file(['shop', 'components', 'Cart', 'index.tsx']),
      file(['rogue', 'thing.ts']),
    ], ['auth', 'shop', 'rogue']), blueprint);

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'undeclared-folder', path: 'src/rogue' }),
      expect.objectContaining({ rule: 'no-entry', path: 'src/auth/components/Login' }),
    ]));

    expect(findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'no-entry', path: 'src/shop/components/Cart' }),
    ]));
  });

  it('reports undeclared inner layers without mistaking direct container files for layers', () => {
    const findings = analyze(scan([
      file(['auth', 'random', 'x.ts']),
      file(['auth', 'shell.tsx']),
    ]), blueprint);

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'undeclared-folder', path: 'src/auth/random' }),
    ]));

    expect(findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'undeclared-folder', path: 'src/auth/shell.tsx' }),
    ]));
  });

  it('reports declared outer modules that have not landed yet', () => {
    const findings = analyze(scan([
      file(['auth', 'hooks', 'useAuth.ts']),
    ], ['auth']), blueprint);

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'missing-module', path: 'src/shop' }),
    ]));
  });

  it('applies layer flow within and across reachable modules', () => {
    const within = analyze(scan([
      file(['auth', 'hooks', 'useAuth.ts'], ['~app/auth/components/Login']),
    ]), blueprint);

    const across = analyze(scan([
      file(['auth', 'hooks', 'useAuth.ts'], ['~app/shop/components/Cart']),
    ]), blueprint);

    expect(within.map((finding) => finding.rule)).toContain('flow-violation');
    expect(across.map((finding) => finding.rule)).toContain('flow-violation');

    expect(across.find((finding) => finding.rule === 'flow-violation')?.message)
      .toContain('inner flow forbids "hooks" → "components"');
  });

  it('handles an alias root and catches same-module deep and relative reaches', () => {
    const findings = analyze(scan([
      file(['auth', 'components', 'Login', 'index.tsx'], [
        '~app',
        '~app/auth/services/api/internal',
        '../Signup/internal.ts',
      ]),
    ]), blueprint);

    expect(findings.filter((finding) => finding.rule === 'deep-import')).toHaveLength(1);
    expect(findings.filter((finding) => finding.rule === 'relative-escape')).toHaveLength(1);
  });
});

describe('inspect graph consumers · module-first topology', () => {
  it('keeps repeated layer units distinct in the dependency graph', () => {
    const graph = buildUnitGraph(scan([
      file(['auth', 'components', 'Panel', 'index.tsx'], ['~app/auth/services/api']),
      file(['auth', 'services', 'api', 'index.ts']),
      file(['shop', 'components', 'Panel', 'index.tsx'], ['~app/shop/services/api']),
      file(['shop', 'services', 'api', 'index.ts']),
    ]), blueprint.architecture);

    expect(graph.units).toEqual(new Set([
      'auth/components/Panel',
      'auth/services/api',
      'shop/components/Panel',
      'shop/services/api',
    ]));

    expect(graph.edges.get('auth/components/Panel')).toEqual(new Set(['auth/services/api']));
    expect(graph.edges.get('shop/components/Panel')).toEqual(new Set(['shop/services/api']));
  });

  it('keeps module-root container source in the graph at the existing container position', () => {
    const graph = buildUnitGraph(scan([
      file(['auth', 'index.tsx'], ['~app/auth/services/api']),
      file(['auth', 'services', 'api', 'index.ts']),
    ]), blueprint.architecture);

    expect(graph.units).toContain('auth');
    expect(graph.edges.get('auth')).toEqual(new Set(['auth/services/api']));
  });

  it('applies existing container import semantics at each module root', () => {
    const findings = analyze(scan([
      file(['auth', 'index.tsx'], [
        '~app/auth/components/Login',
        '~app/auth/services/api/internal',
        'axios',
        './components',
        './components/Login',
      ]),
    ]), blueprint);

    expect(findings.map((finding) => finding.rule)).toEqual(expect.arrayContaining([
      'deep-import',
      'package-ownership',
      'relative-escape',
    ]));

    expect(findings.filter((finding) => finding.subject === '~app/auth/components/Login'))
      .toEqual([]);

    expect(findings.some((finding) => finding.subject === './components')).toBe(true);
  });
});

describe('inspect ownership · module-first topology', () => {
  it('reports declaratory selfOnly runway at each real layer position', () => {
    const selfOnly = defineBlueprint({
      framework: 'react',
      architecture: {
        ...blueprint.architecture,
        layers: blueprint.architecture.layers.map((layer) => layer.name === 'services'
          ? { ...layer, allowedImporters: [{ layer: 'components', selfOnly: true }] }
          : layer),
      },
    });

    const findings = analyze(scan([
      file(['auth', 'components', 'Login', 'index.tsx']),
      file(['shop', 'services', 'api', 'index.ts']),
    ]), selfOnly);

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rule: 'declaratory-self-only',
        path: 'src/auth/services',
      }),
    ]));

    expect(findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        rule: 'declaratory-self-only',
        path: 'src/shop/services',
      }),
      expect.objectContaining({
        rule: 'declaratory-self-only',
        path: 'src/services',
      }),
    ]));
  });

  it('addresses ownership runway at every resolved module-layer position', () => {
    const findings = analyze(scan([], []), blueprint, [])
      .filter((finding) => finding.rule === 'owns-not-installed');

    expect(findings.map((finding) => finding.path)).toEqual([
      'src/auth/services',
      'src/shop/services',
    ]);
  });

  it('keys module roots, containers, layers, and file-layout units by module identity', () => {
    const resolved = resolveArchitecture(blueprint.architecture);

    expect(positionKey(resolved.classify('src/auth')!)).toBe('auth');
    expect(positionKey(resolved.classify('src/auth/index.ts')!)).toBe('auth');
    expect(positionKey(resolved.classify('src/auth/components')!)).toBe('auth/components');
    expect(positionKey(resolved.classify('src/auth/hooks/useAuth.ts')!)).toBe('auth/hooks');
  });
});
