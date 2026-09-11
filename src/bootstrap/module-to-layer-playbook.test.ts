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
    aliasCutovers: [],
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

function expectFragments(result: string, fragments: string[]): void {
  for (const fragment of fragments) {
    expect(result).toContain(fragment);
  }
}

function riskResult(): string {
  return moduleToLayerBrief({
    evidence: evidence({
      aliases: { '~app': 'src', '@domain': 'src/auth', '@shared': 'src/shared' },
      architectureBasis: {
        alias: '~app',
        additionalAliases: { '@shared': 'src/shared' },
        layers: [{ name: 'components', does: 'UI', layout: 'folder', entry: 'index' }],
      },
      aliasCutovers: [{
        alias: '@domain',
        target: 'src/auth',
        disposition: 'rewrite-or-remove',
        mappedDestinations: ['src/containers/auth/Auth.ts', 'src/hooks/useSession.ts'],
      }, {
        alias: '@shared',
        target: 'src/shared',
        disposition: 'preserve',
        mappedDestinations: [],
      }],
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

    expectFragments(result, [
      'Git worktree at preflight: clean (0 changes)',
      'Additional-alias cutover\n\n- (none configured)',
      'Destination collisions\n\n- (none measured)',
      'Cycles in pre-transform governed graph: (none)',
      'Relative import structural evidence: (none)',
      'Pre-transform inspection recorded 0 finding(s):\n- (none)',
      '## Filesystem movement and import rewrite',
      '## Verification and handoff',
      'npm install',
      'git diff --summary',
      'npx blueprint doctor --json',
    ]);
  });
});

describe('module-first to layer-first playbook risks', () => {
  it('renders mappings, collision/import risks, baseline debt, and React routing', () => {
    const result = riskResult();

    expect(result).toContain('src/auth/Auth.ts` → `src/containers/auth/Auth.ts');
    expect(result).toContain('src/hooks/usesession.ts');
    expect(result).toContain('app → [auth]');
    expect(result).toContain('app → auth (1)');
    expect(result).toContain('src/legacy/orphan.ts');
    expect(result).toContain('~missing/session');
    expect(result).toContain('`@domain` → `src/auth` · rewrite-or-remove');
    expect(result).toContain('`@shared` → `src/shared` · preserve');
    expect(result).toContain('Never preserve an alias that points at an obsolete module path');
    expect(result).not.toContain('"@domain": "src/auth"');
    expect(result).toContain('Parse failure: src/auth/Broken.ts — Unexpected token');
    expect(result).toContain('For React/Vue, classify each reserved `app/**` file');
    expect(result).toContain('module-dependency · src/checkout/hooks/useCheckout.ts');

    expectFragments(result, [
      'Pre-transform additional aliases: `@domain` → `src/auth`, `@shared` → `src/shared`',
      'mapped files → `src/containers/auth/Auth.ts`, `src/hooks/useSession.ts`',
      'mapped files → (none)',
      'src/auth/hooks/useSession.ts`, `src/checkout/hooks/useSession.ts`',
      'auth/hooks → checkout/hooks → auth/hooks',
      'Unresolved alias-like imports: auth/hooks: ~missing/session',
      'auth/hooks: ../../checkout/hooks/useSession → checkout/hooks (target unit measured)',
      'auth/services: ../../../outside/runtime → (outside governed structure) '
      + '(target unit not measured)',
      'pnpm add -D @kekkai/blueprint',
      'Delete the generated files. Cleanup must happen before the final doctor run',
    ]);
  });

  it('renders a finding without a subject explicitly', () => {
    const result = moduleToLayerBrief({
      evidence: evidence(),
      preflight,
      findings: [{
        severity: 'warn',
        rule: 'unclassified',
        path: 'src/legacy.ts',
        subject: '',
        message: 'unclassified',
      }],
      state: state(),
      install: 'npm install',
      cleanup: 'the playbook.',
    });

    expect(result).toContain('- unclassified · src/legacy.ts · (no subject)');
  });
});

describe('module-first to layer-first Next.js playbook', () => {
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
