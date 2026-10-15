import { expect, it } from 'vitest';
import type { ModuleDependencies, ModuleDependencyRow } from './module-dependencies-types';
import { moduleDependencyFindings } from './module-dependencies-findings';

function row(): ModuleDependencyRow {
  return {
    name: 'a', root: 'packages/web/src/a', declaredDirect: ['b'], reachable: ['b', 'c'],
    observedDirect: [
      { from: 'a', to: 'b', references: 1, permission: 'direct', evidence: [{ path: 'a.ts',
        specifier: 'b' }] },
      { from: 'a', to: 'c', references: 2, permission: 'transitive', evidence: [{ path: 'a.ts',
        specifier: 'c' }] },
      { from: 'a', to: 'd', references: 1, permission: 'forbidden', evidence: [{ path: 'a.ts',
        specifier: 'd' }] },
    ],
    matched: ['b'], missingDeclarations: ['c', 'd'], unusedDeclarations: ['z'],
    unverifiedDeclarations: ['x'], uncertainty: [{ cause: 'runtime-dependent-import',
      path: 'a.ts' }],
    reach: 'covered',
  };
}

it.each(['error', 'warn'])('aggregates pair and importer finding identities at %s severity',
  (tier) => {
    const result: ModuleDependencies = { status: 'drift', modules: [row()] };
    const findings = moduleDependencyFindings(result, tier);

    expect(findings.map(({ message: _message, ...identity }) => identity)).toEqual([
      { severity: tier, path: 'packages/web/src/a',
        rule: 'module-dependency-missing', subject: 'c' },
      { severity: tier, path: 'packages/web/src/a',
        rule: 'module-dependency-missing', subject: 'd' },
      { severity: tier, path: 'packages/web/src/a',
        rule: 'module-dependency-unused', subject: 'z' },
      { severity: tier, path: 'packages/web/src/a',
        rule: 'module-dependency-unverified',
        subject: 'analysis' },
    ]);

    expect(findings[0].message).toMatch(/transitive/i);
    expect(findings[1].message).toMatch(/forbid/i);
    expect(findings[2].message).toContain('z');
    expect(findings[3].message).toContain('x');
    expect(result.status).toBe('drift');
  });

it.each([undefined, 'off'])('disabled setting %s emits nothing', (tier) => {
  expect(moduleDependencyFindings({ status: 'drift', modules: [row()] }, tier)).toEqual([]);
});

it('has no findings for unavailable, runway, or synchronized facts', () => {
  expect(moduleDependencyFindings(null, 'error')).toEqual([]);
  expect(moduleDependencyFindings({ status: 'runway', modules: [] }, 'error')).toEqual([]);
  const complete = row();

  complete.missingDeclarations = [];
  complete.unusedDeclarations = [];
  complete.uncertainty = [];

  expect(moduleDependencyFindings({ status: 'synchronized', modules: [complete] },
    'error')).toEqual([]);
});
