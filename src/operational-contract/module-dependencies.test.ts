import { expect, it } from 'vitest';

import { emitAgentContract } from '../emit/agent';
import { emitHandbook } from '../emit/docs';
import type { Blueprint } from '../config';
import { renderCompactContract } from './agent';
import {
  renderModuleDependencies, renderModuleDependencyOutput, renderModuleDependencyGuidance,
  renderModuleDependencyDerivation, renderCompactModuleSync,
  renderModuleDependencyMissing, renderModuleDependencyUnused, renderModuleDependencyUnverified,
} from './module-dependencies';
import type { ModuleDependencyRowView, ModuleEdgeView } from './module-dependencies';
import { renderLintGateNote, renderModuleDependencySyncUnavailable } from './lint';

const edge: ModuleEdgeView = {
  from: 'a', to: 'c', references: 2, permission: 'transitive',
  evidence: [{ path: 'src/a/index.ts', specifier: '~app/c' }],
};

const row: ModuleDependencyRowView = {
  name: 'a', root: 'src/a', declaredDirect: ['b'], reachable: ['b', 'c'],
  observedDirect: [edge], matched: [], missingDeclarations: ['c'], unusedDeclarations: [],
  unverifiedDeclarations: ['b'], reach: 'covered',
  uncertainty: [{ path: 'src/a/index.ts', cause: 'runtime-dependent-import' }],
};

const blueprint: Blueprint = {
  framework: 'react', architecture: {
    alias: '~app', modules: [{ name: 'a', does: 'A' }],
    layers: [{ name: 'components', does: 'UI', layout: 'folder' }],
  },
};

it('keeps repository status and full deterministic evidence beside targeted rows', () => {
  const report = { status: 'drift' as const, modules: [row, { ...row, name: 'b' }] };
  const output = renderModuleDependencies(report, 'a');

  expect(output).toContain('repository status: drift');
  expect(output).toContain('Target module: a; status above remains repository-wide.');
  expect(output).toContain('a (src/a; covered)');
  expect(output).not.toContain('b (src/a');

  for (const text of ['declared direct: b', 'transitive permission closure: b, c',
    'observed direct: c', 'matched: none', 'missing declarations: c',
    'unused declarations: none', 'unverified declarations: b']) {
    expect(output).toContain(text);
  }

  expect(output).toContain('a -> c: 2 references; permission transitive; src/a/index.ts: ~app/c');
  expect(output).toContain('uncertainty: src/a/index.ts: runtime-dependent-import');
  expect(renderModuleDependencies(report)).toContain('b (src/a; covered)');

  expect(renderModuleDependencyOutput('units', report)).toBe(
    `${renderModuleDependencies(report)}\n\nunits`,
  );

  expect(renderModuleDependencies(null)).toBe('');
  expect(renderModuleDependencyOutput('units', null)).toBe('units');
});

it('shows vacuity, empty edges and absence of uncertainty explicitly', () => {
  const output = renderModuleDependencies({ status: 'synchronized', modules: [{
    ...row, reach: 'vacuous', observedDirect: [], uncertainty: [],
  }] });

  expect(output).toContain('repository status: synchronized');
  expect(output).toContain('a (src/a; vacuous)');
  expect(output).toContain('observed direct: none');
  expect(output).toContain('uncertainty: none');

  expect(renderModuleDependencies({ status: 'runway', modules: [] })).toContain(
    'repository status: runway',
  );
});

it('separates permitted direct drift from forbidden architecture changes', () => {
  expect(renderModuleDependencyMissing(row, edge)).toBe(
    'Module a directly references c, absent from dependsOn (2 references; '
    + 'src/a/index.ts: ~app/c). Transitive module permission allows this edge, but does not '
    + 'declare direct coupling. Review the source and intended architecture with the owner; '
    + 'do not automatically add a dependency or create a declared cycle.',
  );

  expect(renderModuleDependencyMissing(row, { ...edge, permission: 'forbidden' })).toContain(
    'Module permission forbids this edge; the independent flow violation still applies.',
  );

  expect(renderModuleDependencyUnused(row, 'b')).toBe(
    'Module a declares direct dependency b, but complete governed-source analysis found no '
    + 'direct reference. Exact synchronization compares direct edges, even when another path '
    + 'grants the same permission. Review the intended architecture with the owner before '
    + 'changing source or dependsOn.',
  );
});

it('preserves uncertainty causes and distinguishes unverified from unused', () => {
  expect(renderModuleDependencyUnverified(row)).toContain(
    'Unobserved declarations remain unverified, not unused: b.',
  );

  const output = renderModuleDependencyUnverified({ ...row, uncertainty: [
    { cause: 'unresolved-project-reference', path: 'src/a/x.ts',
      specifier: './gone', detail: 'missing' },
    { cause: 'parse-failure', path: 'src/a/y.ts' },
  ] });

  expect(output).toContain('src/a/x.ts: unresolved-project-reference (./gone) — missing; '
    + 'src/a/y.ts: parse-failure');

  expect(output).toContain('proven drift remains independently actionable');
});

it('delivers config-derived guidance to both generated surfaces without live observations', () => {
  const guidance = renderModuleDependencyGuidance(blueprint.architecture, '###');

  expect(emitAgentContract(blueprint)).toContain(guidance);

  expect(emitHandbook(blueprint)).toContain(
    renderModuleDependencyGuidance(blueprint.architecture, '##'),
  );

  expect(guidance).toContain('type-only references count');

  expect(guidance).toContain(
    'Runtime-dependent imports, parse failures and unresolved project references',
  );

  expect(guidance).toContain('Equality does not prove domain ownership');
  expect(guidance).not.toContain('repository status:');

  expect(renderModuleDependencyGuidance({
    alias: '~app', layers: blueprint.architecture.layers,
  }, '##')).toBe('');
});

it('identifies opt-in error synchronization as an Inspect gate in compact guidance', () => {
  const facts = { handbook: 'HANDBOOK.md', gates: [{
    id: 'moduleDependencySync', holder: 'inspect' as const, setting: 'error' as const,
  }] };

  expect(renderCompactContract(blueprint, facts)).toContain(
    'Direct module synchronization is an Inspect gate',
  );

  expect(renderCompactContract(blueprint, { ...facts, gates: [] })).not.toContain(
    'Direct module synchronization is an Inspect gate',
  );

  expect(renderLintGateNote('moduleDependencySync')).toBe(
    'Inspect runtime gate only; baseline is a debt ratchet, not exact equality. '
    + 'Doctor does not prove CI executes Inspect; no ESLint carrier.',
  );

  expect(renderModuleDependencySyncUnavailable()).toBe(
    'moduleDependencySync requires module-first topology; layer-first has no module graph.',
  );
});

it('publishes derivation scope for machine-readable reports', () => {
  expect(renderModuleDependencyDerivation()).toContain(
    'observed direct references are compared only',
  );

  expect(renderModuleDependencyDerivation()).toContain('type-only references count');
  expect(renderModuleDependencyDerivation()).toContain('unverified, not unused');
});

it('requires module-first and an error tier for the compact synchronization directive', () => {
  expect(renderCompactModuleSync('layer-first', [
    { id: 'moduleDependencySync', setting: 'error' },
  ])).toEqual([]);

  expect(renderCompactModuleSync('module-first', [
    { id: 'cycles', setting: 'error' },
    { id: 'moduleDependencySync', setting: 'warn' },
  ])).toEqual([]);

  expect(renderCompactModuleSync('module-first', [
    { id: 'moduleDependencySync', setting: { tier: 'error' } },
  ])).toEqual(renderCompactModuleSync('module-first', [
    { id: 'moduleDependencySync', setting: 'error' },
  ]));
});
