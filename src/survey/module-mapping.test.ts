import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { ArchitectureDef } from '../config';
import { runSurvey } from './survey';
import { collectModuleToLayerEvidence, destinationCollisions } from './module-mapping';

const dirs: string[] = [];

function fixture(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-module-mapping-'));

  dirs.push(root);

  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, file);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }

  return root;
}

function architecture(overrides: Partial<ArchitectureDef> = {}): ArchitectureDef {
  return {
    alias: '~app',
    modules: [
      { name: 'app', does: 'router composition', dependsOn: ['auth'] },
      { name: 'auth', does: 'authentication' },
      { name: 'checkout', does: 'checkout' },
    ],
    layers: [
      { name: 'components', does: 'UI', layout: 'folder' },
      { name: 'hooks', does: 'state', layout: 'file' },
      { name: 'services', does: 'data', layout: 'folder' },
    ],
    ...overrides,
  };
}

afterEach(() => {
  while (dirs.length) {
    fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
  }
});

describe('module-first to layer-first mapping evidence', () => {
  it('maps container roots and both unit layouts while reporting collisions', () => {
    const root = fixture({
      'src/main.ts': 'import \'~app/app/Login\';\n',
      'src/app/Login.ts': 'import \'~app/auth/AuthRoot\';\n',
      'src/app/components/RouteShell.ts': 'export const routeShell = 1;\n',
      'src/auth/AuthRoot.ts': 'import \'~app/auth/hooks/useSession\';\n',
      'src/auth/components/Form/index.ts': 'export const form = 1;\n',
      'src/auth/hooks/useSession.ts': 'export const session = 1;\n',
      'src/checkout/hooks/useSession.ts': 'export const checkout = 1;\n',
      'src/legacy/orphan.ts': 'export const orphan = 1;\n',
    });

    const survey = runSurvey(root, { sourceRoot: 'src', log: () => {} });

    const result = collectModuleToLayerEvidence({
      root,
      survey,
      architecture: architecture({
        additionalAliases: { '@domain': 'src/auth', '@shared': 'src/shared' },
      }),
      nextAppRouter: false,
    });

    expect(result.rootWiring).toEqual(['main.ts']);

    expect(result.mappings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'src/auth/AuthRoot.ts',
        destination: 'src/containers/auth/AuthRoot.ts',
        layout: 'container',
      }),
      expect.objectContaining({
        source: 'src/auth/components/Form/index.ts',
        destination: 'src/components/Form/index.ts',
        layout: 'folder',
      }),
      expect.objectContaining({
        source: 'src/auth/hooks/useSession.ts',
        destination: 'src/hooks/useSession.ts',
        layout: 'file',
      }),
      expect.objectContaining({
        source: 'src/app/Login.ts',
        destination: 'src/pages/Login.ts',
        layout: 'router',
        disposition: 'agent-router-decision',
      }),
      expect.objectContaining({
        source: 'src/app/components/RouteShell.ts',
        destination: 'src/pages/components/RouteShell.ts',
        layout: 'router',
        disposition: 'agent-router-decision',
      }),
    ]));

    expect(result.collisions).toEqual([{
      destination: 'src/hooks/usesession.ts',
      sources: ['src/auth/hooks/useSession.ts', 'src/checkout/hooks/useSession.ts'],
    }]);

    expect(result.orphans).toEqual(['src/legacy/orphan.ts']);
    expect(result.modules).toContainEqual({ name: 'app', dependsOn: ['auth'] });

    expect(result.layers).toEqual([
      { name: 'components', layout: 'folder', entry: 'index' },
      { name: 'hooks', layout: 'file', entry: 'index' },
      { name: 'services', layout: 'folder', entry: 'index' },
    ]);

    expect(result.aliasCutovers).toEqual([{
      alias: '@domain',
      target: 'src/auth',
      disposition: 'rewrite-or-remove',
      mappedDestinations: [
        'src/components/Form/index.ts',
        'src/containers/auth/AuthRoot.ts',
        'src/hooks/useSession.ts',
      ],
    }, {
      alias: '@shared',
      target: 'src/shared',
      disposition: 'preserve',
      mappedDestinations: [],
    }]);

    expect(result.architectureBasis).toEqual(expect.objectContaining({
      additionalAliases: { '@shared': 'src/shared' },
    }));

    expect(result.architectureBasis).not.toHaveProperty('modules');
  });
});

describe('module-first to layer-first destination safety', () => {
  it('groups exact and case-insensitive final physical path collisions', () => {
    const basis = {
      module: 'auth',
      layer: 'components',
      layout: 'folder' as const,
      disposition: 'move' as const,
    };

    expect(destinationCollisions([{
      ...basis,
      source: 'src/auth/components/Button/index.ts',
      destination: 'src/components/Button/index.ts',
    }, {
      ...basis,
      module: 'checkout',
      source: 'src/checkout/components/button/index.ts',
      destination: 'src/components/button/index.ts',
    }, {
      ...basis,
      module: 'profile',
      source: 'src/profile/components/Button/index.ts',
      destination: 'src/components/Button/index.ts',
    }])).toEqual([{
      destination: 'src/components/button/index.ts',
      sources: [
        'src/auth/components/Button/index.ts',
        'src/checkout/components/button/index.ts',
        'src/profile/components/Button/index.ts',
      ],
    }]);
  });

  it('treats an unmoved file already at a final destination as a collision', () => {
    const mapping = {
      source: 'src/auth/hooks/useSession.ts',
      destination: 'src/hooks/useSession.ts',
      module: 'auth',
      layer: 'hooks',
      layout: 'file' as const,
      disposition: 'move' as const,
    };

    expect(destinationCollisions([mapping, {
      ...mapping,
      source: 'src/auth/services/session.ts',
      destination: 'src/services/session.ts',
      layer: 'services',
    }, {
      ...mapping,
      module: 'checkout',
      source: 'src/checkout/services/session.ts',
      destination: 'src/services/session.ts',
      layer: 'services',
    }], [
      mapping.source,
      'src/hooks/useSession.ts',
    ])).toEqual([{
      destination: 'src/hooks/usesession.ts',
      sources: ['src/auth/hooks/useSession.ts', 'src/hooks/useSession.ts'],
    }, {
      destination: 'src/services/session.ts',
      sources: ['src/auth/services/session.ts', 'src/checkout/services/session.ts'],
    }]);
  });
});

describe('module-first to layer-first router mapping', () => {
  it('preserves a physical Next.js App Router tree and root-layout paths', () => {
    const root = fixture({
      'app/login/page.tsx': 'import \'~app/auth/components/LoginPanel\';\n',
      'app/login/loading.tsx': 'export default () => null;\n',
      'auth/components/LoginPanel/index.ts': 'export const panel = 1;\n',
    });

    const config = architecture({ sourceRoot: '.', additionalAliases: { '@routes': 'app' } });
    const survey = runSurvey(root, { sourceRoot: '.', log: () => {} });

    const result = collectModuleToLayerEvidence({
      root, survey, architecture: config, nextAppRouter: true,
    });

    expect(result.mappings).toContainEqual(expect.objectContaining({
      source: 'app/login/page.tsx',
      destination: 'app/login/page.tsx',
      disposition: 'preserve-next-route',
    }));

    expect(result.mappings).toContainEqual(expect.objectContaining({
      source: 'app/login/loading.tsx',
      destination: 'app/login/loading.tsx',
      disposition: 'preserve-next-route',
    }));

    expect(result.mappings).toContainEqual(expect.objectContaining({
      source: 'auth/components/LoginPanel/index.ts',
      destination: 'components/LoginPanel/index.ts',
    }));

    expect(result.aliasCutovers).toEqual([{
      alias: '@routes',
      target: 'app',
      disposition: 'preserve',
      mappedDestinations: ['app/login/loading.tsx', 'app/login/page.tsx'],
    }]);
  });

  it('rejects evidence collection for a layer-first config', () => {
    const root = fixture({ 'src/components/Button.ts': 'export const Button = 1;\n' });
    const config = architecture({ modules: undefined });
    const survey = runSurvey(root, { sourceRoot: 'src', log: () => {} });

    expect(() => collectModuleToLayerEvidence({
      root, survey, architecture: config, nextAppRouter: false,
    })).toThrow(
      'requires a module-first architecture',
    );
  });
});
