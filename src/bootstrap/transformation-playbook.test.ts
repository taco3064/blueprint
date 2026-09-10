import { describe, expect, it } from 'vitest';

import type { ProjectState } from '../project';
import type { TransformationEvidence } from '../survey';
import type { TransformationPreflight } from './preflight';
import { layerToModuleBrief } from './transformation-playbook';

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

const preflight: TransformationPreflight = {
  ok: true,
  repository: { ok: true, root: '/repo' },
  worktree: { ok: true, changes: [] },
  head: { ok: true, commit: 'abc123' },
  scope: { ok: true, selected: 'src' },
  inspection: { ok: true, findings: [] },
};

function evidence(overrides: Partial<TransformationEvidence> = {}): TransformationEvidence {
  return {
    sourceRoot: 'src',
    aliases: {},
    resolutionBasis: 'blueprint-config',
    rootWiring: [],
    sourceLayers: [],
    seedSource: 'none',
    candidates: [],
    routerCandidates: [],
    overlaps: [],
    orphans: [],
    edges: [],
    cycles: [],
    collisionRisks: [],
    unresolvedAliasLikeImports: [],
    relativeImports: [],
    unknownDynamicImports: 0,
    parseFailures: [],
    ...overrides,
  };
}

describe('layer-first to module-first playbook', () => {
  it('renders empty evidence honestly instead of inventing candidates', () => {
    const result = layerToModuleBrief({
      evidence: evidence(),
      preflight: { ...preflight, worktree: { ok: true } },
      findings: [],
      state: state({ framework: null, hasNext: true, nextRouter: null }),
      install: 'npm install',
      cleanup: 'the playbook.',
    });

    expect(result).toContain('No container, page, or App Router seed was measured');
    expect(result).toContain('Canonical source wiring: (none detected)');
    expect(result).toContain('Framework/router: `unknown` / Next.js unresolved Router');

    expect(result).toContain(
      'Canonical governed unit edges (same identities as inspect/deps): (none)',
    );

    expect(result).toContain('Pre-transform inspection recorded 0 finding(s)');
  });

  it('renders every non-empty risk surface and the Vue route path', () => {
    const result = layerToModuleBrief({
      evidence: evidence({
        aliases: { '~app': 'src' },
        rootWiring: ['main.ts'],
        sourceLayers: [{ layer: 'containers', units: ['containers/Auth'] }],
        seedSource: 'containers',
        candidates: [{
          seed: 'containers/Auth',
          source: 'container',
          reachableUnits: ['containers/Auth', 'hooks/useAuth'],
          directImports: [{ from: 'containers/Auth', to: 'hooks/useAuth', count: 1 }],
          closureEdges: [{ from: 'containers/Auth', to: 'hooks/useAuth', count: 1 }],
          closureConsumers: [{ from: 'pages/Login', to: 'containers/Auth', count: 2 }],
          unresolvedAliasLikeImports: ['hooks/useAuth: ~missing/auth'],
        }],
        routerCandidates: [{
          seed: 'pages/Login',
          source: 'page',
          reachableUnits: ['containers/Auth', 'hooks/useAuth', 'pages/Login'],
          directImports: [{ from: 'pages/Login', to: 'containers/Auth', count: 2 }],
          closureEdges: [{ from: 'pages/Login', to: 'containers/Auth', count: 2 }],
          closureConsumers: [],
          unresolvedAliasLikeImports: [],
        }],
        overlaps: [{ unit: 'hooks/useAuth', seeds: ['containers/Auth', 'containers/Profile'] }],
        orphans: ['icons/Logo'],
        edges: [{ from: 'containers/Auth', to: 'hooks/useAuth', count: 1 }],
        cycles: [['services/auth', 'contexts/session', 'services/auth']],
        collisionRisks: [{ identity: 'components/button', units: [
          'components/Button', 'Components/button',
        ] }],
        unresolvedAliasLikeImports: [{ unit: 'hooks/useAuth', specifier: '~missing/auth' }],
        relativeImports: [{
          importer: 'containers/Auth',
          specifier: '../../components/Form',
          structuralTarget: 'components/Form',
          targetUnitMeasured: true,
        }, {
          importer: 'containers/Auth',
          specifier: '../../missing/Form',
          structuralTarget: null,
          targetUnitMeasured: false,
        }],
        parseFailures: [{ path: 'src/pages/Broken.ts', message: 'Unexpected token' }],
      }),
      preflight,
      findings: [{
        severity: 'error',
        rule: 'flow-violation',
        path: 'src/pages/Login.ts',
        subject: '~app/hooks/useAuth',
        message: 'wrong direction',
      }],
      state: state({ framework: 'vue' }),
      install: 'pnpm add -D @kekkai/blueprint',
      cleanup: 'the generated files.',
    });

    expect(result).toContain('containers/Auth (container seed)');
    expect(result).toContain('pages/Login → containers/Auth (2)');
    expect(result).toContain('hooks/useAuth ← containers/Auth, containers/Profile');
    expect(result).toContain('services/auth → contexts/session → services/auth');
    expect(result).toContain('components/button ← components/Button, Components/button');
    expect(result).toContain('Parse failure: src/pages/Broken.ts — Unexpected token');
    expect(result).toContain('flow-violation · src/pages/Login.ts · ~app/hooks/useAuth');
  });
});
