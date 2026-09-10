import { describe, expect, it } from 'vitest';

import type { ProjectState } from '../project';
import type { ModuleToLayerEvidence } from '../survey';
import type { TransformationPreflight } from './preflight';
import { moduleToLayerBrief } from './module-to-layer-playbook';

const preflight: TransformationPreflight = {
  ok: true,
  repository: { ok: true, root: '/repo' },
  worktree: { ok: true, changes: [] },
  head: { ok: true, commit: 'abc123' },
  scope: { ok: true, selected: 'src' },
  inspection: { ok: true, findings: [] },
};

function state(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    root: '/repo',
    framework: 'react',
    packageManager: 'npm',
    hasConfig: true,
    hasEslintConfig: false,
    wiredEslintConfig: false,
    hasNext: false,
    hasNuxt: false,
    nextRouter: null,
    nextSrcDir: false,
    hasViteConfig: false,
    hasTypescript: true,
    tsconfigs: {},
    existingSrcDirs: [],
    missingDeps: [],
    dependencies: [],
    ...overrides,
  };
}

function evidence(overrides: Partial<ModuleToLayerEvidence> = {}): ModuleToLayerEvidence {
  return {
    sourceRoot: 'src',
    aliases: { '~app': 'src' },
    rootWiring: ['main.ts'],
    modules: [{ name: 'auth', dependsOn: [] }],
    layers: [{ name: 'components', layout: 'folder', entry: 'index' }],
    architectureBasis: {
      alias: '~app',
      layers: [{ name: 'components', does: 'UI', layout: 'folder', entry: 'index' }],
    },
    mappings: [],
    collisions: [],
    orphans: [],
    edges: [],
    cycles: [],
    unresolvedAliasLikeImports: [],
    relativeImports: [],
    unknownDynamicImports: 0,
    parseFailures: [],
    ...overrides,
  };
}

describe('module-first to layer-first playbook', () => {
  it('renders empty evidence without claiming a migration can proceed', () => {
    const result = moduleToLayerBrief({
      evidence: evidence(),
      preflight: { ...preflight, worktree: { ok: true } },
      findings: [],
      state: state({ framework: null, hasNext: true }),
      install: 'npm install',
      cleanup: 'the playbook.',
    });

    expect(result).toContain('no governed source mapping was measured; stop before movement');
    expect(result).toContain('Current topology: `module-first`');
    expect(result).toContain('Target topology: `layer-first`');
    expect(result).toContain('Pre-transform inspection recorded 0 finding(s)');
    expect(result).toContain('Framework/router: `unknown`');
    expect(result).toContain('Next.js unresolved Router');
    expect(result).toContain('components (folder; entry index)');
    expect(result).toContain('does not auto-sort layers');
    expect(result).toContain('Proposed layer-first architecture basis');
  });
});

describe('module-first to layer-first playbook risks', () => {
  it('renders mappings, collision/import risks, baseline debt, and React routing', () => {
    const result = moduleToLayerBrief({
      evidence: evidence({
        modules: [
          { name: 'app', dependsOn: ['auth'] },
          { name: 'auth', dependsOn: [] },
          { name: 'checkout', dependsOn: ['auth'] },
        ],
        mappings: [{
          source: 'src/auth/Auth.ts',
          destination: 'src/containers/auth/Auth.ts',
          module: 'auth',
          layer: 'containers',
          layout: 'container',
          disposition: 'move',
        }, {
          source: 'src/app/Login.ts',
          destination: 'src/pages/Login.ts',
          module: 'app',
          layer: 'pages',
          layout: 'router',
          disposition: 'move',
        }],
        collisions: [{
          destination: 'src/hooks/usesession.ts',
          sources: ['src/auth/hooks/useSession.ts', 'src/checkout/hooks/useSession.ts'],
        }],
        orphans: ['src/legacy/orphan.ts'],
        edges: [{ from: 'app', to: 'auth', count: 1 }],
        cycles: [['auth/hooks', 'checkout/hooks', 'auth/hooks']],
        unresolvedAliasLikeImports: [{ unit: 'auth/hooks', specifier: '~missing/session' }],
        relativeImports: [{
          importer: 'auth/hooks',
          specifier: '../../checkout/hooks/useSession',
          structuralTarget: 'checkout/hooks',
          targetUnitMeasured: true,
        }, {
          importer: 'auth/services',
          specifier: '../../../outside/runtime',
          structuralTarget: null,
          targetUnitMeasured: false,
        }],
        unknownDynamicImports: 1,
        parseFailures: [{ path: 'src/auth/Broken.ts', message: 'Unexpected token' }],
      }),
      preflight,
      findings: [{
        severity: 'error',
        rule: 'module-dependency',
        path: 'src/checkout/hooks/useCheckout.ts',
        subject: '~app/auth/hooks/useSession',
        message: 'undeclared edge',
      }],
      state: state({ framework: 'vue' }),
      install: 'pnpm add -D @kekkai/blueprint',
      cleanup: 'the generated files.',
    });

    expect(result).toContain('src/auth/Auth.ts` → `src/containers/auth/Auth.ts');
    expect(result).toContain('src/hooks/usesession.ts');
    expect(result).toContain('app → [auth]');
    expect(result).toContain('app → auth (1)');
    expect(result).toContain('src/legacy/orphan.ts');
    expect(result).toContain('~missing/session');
    expect(result).toContain('Parse failure: src/auth/Broken.ts — Unexpected token');
    expect(result).toContain('For React/Vue, classify each reserved `app/**` file');
    expect(result).toContain('module-dependency · src/checkout/hooks/useCheckout.ts');
  });

  it('states the Next.js physical route preservation contract', () => {
    const result = moduleToLayerBrief({
      evidence: evidence({
        mappings: [{
          source: 'src/app/login/page.tsx',
          destination: 'src/app/login/page.tsx',
          module: 'app',
          layer: 'app',
          layout: 'router',
          disposition: 'preserve-next-route',
        }],
      }),
      preflight,
      findings: [],
      state: state({ hasNext: true, nextRouter: 'app' }),
      install: 'npm install',
      cleanup: 'the playbook.',
    });

    expect(result).toContain('preserve-next-route');
    expect(result).toContain('Preserve every physical `app/**` route segment');
  });
});
