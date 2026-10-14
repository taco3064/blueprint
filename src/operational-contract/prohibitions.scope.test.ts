import { expect, it } from 'vitest';
import { resolveArchitecture } from '../config';
import type { ArchitectureDef, Blueprint, ResolveArchitectureContext } from '../config';
import { renderCompactProhibitions, renderProhibitionScope } from './prohibitions';
import { renderPlacement } from './agent';
import { renderArchitecture } from './handbook';

function architecture(): ArchitectureDef {
  return { alias: '@', layers: [{
    name: 'domain', does: 'policy', mustNot: [{
      id: 'no-call', description: 'render UI', checks: [{ call: 'divIcon' }],
    }],
  }] };
}

it('omits scope for absent layers and review-only declarations', () => {
  const resolved = resolveArchitecture({ alias: '@', layers: [
    { name: 'empty', does: 'empty' },
    { name: 'review', does: 'review', mustNot: ['render UI'] },
  ] });

  expect(renderProhibitionScope(resolved, 'missing')).toBe('');
  expect(renderProhibitionScope(resolved, 'empty')).toBe('');
  expect(renderProhibitionScope(resolved, 'review')).toBe('');
});

it('renders default extension and test scope without claiming measured protection', () => {
  expect(renderProhibitionScope(resolveArchitecture(architecture()), 'domain'))
    .toBe('Governed files: src/domain/**/*.{js,jsx,ts,tsx,vue}; ignores: '
      + '**/*.test.{js,jsx,ts,tsx,vue}, **/*.spec.{js,jsx,ts,tsx,vue}. Reach: unmeasured; '
      + 'empty positions are not behavioral protection; Inspect measures current reach.');
});

it.each(['**/generated/**', ['**/generated/**', '**/vendor/**']])(
  'renders file nets, ignores %j, and test exemptions', (layerFilesIgnore) => {
    const resolved = resolveArchitecture({
      ...architecture(), sourceRoot: 'app-src',
      modules: [{ name: 'shop', does: 'shop' }, { name: 'account', does: 'account' }],
      layerFiles: ['{module}/{layer}/*.ts', '{module}/{layer}/*.tsx'],
      layerFilesIgnore, testFiles: ['**/*.check.ts'],
    });

    expect(renderProhibitionScope(resolved, 'domain', 'react'))
      .toBe('Governed files: app-src/shop/domain/*.ts, app-src/shop/domain/*.tsx, '
        + 'app-src/account/domain/*.ts, app-src/account/domain/*.tsx; ignores: '
        + `${[layerFilesIgnore].flat().join(', ')}, **/*.check.ts. Reach: unmeasured; `
        + 'empty positions are not behavioral protection; Inspect measures current reach.');
  },
);

it('renders empty net and ignore boundaries explicitly', () => {
  const resolved = resolveArchitecture({ ...architecture(), layerFiles: [], testFiles: [] });

  expect(renderProhibitionScope(resolved, 'domain'))
    .toBe('Governed files: (none); ignores: (none). Reach: unmeasured; '
      + 'empty positions are not behavioral protection; Inspect measures current reach.');
});

it('keeps future module scope and runway reach visible in compact output', () => {
  const bp: Blueprint = { framework: 'react', architecture: {
    ...architecture(), modules: [], sourceRoot: 'app-src', testFiles: [],
    layers: [...architecture().layers, { name: 'services', does: 'network', mustNot: [{
      id: 'no-browser', description: 'use browser globals', checks: [{ global: 'window' }],
    }] }],
  } };

  const lines = renderCompactProhibitions(bp);

  expect(lines).toHaveLength(3);
  expect(lines[1]).toContain('- domain: no-call: render UI [lint backed');
  expect(lines[1]).toContain('Governed files: app-src/!(app)/domain/**/*.{js,jsx,ts,tsx}');
  expect(lines[1]).not.toContain('app-src/!(app)/services/');
  expect(lines[2]).toContain('- services: no-browser: use browser globals [lint backed');
  expect(lines[2]).toContain('Governed files: app-src/!(app)/services/**/*.{js,jsx,ts,tsx}');
  expect(lines[2]).not.toContain('app-src/!(app)/domain/');
  expect(lines[1]).toContain('ignores: (none). Reach: runway;');
  expect(lines[2]).toContain('ignores: (none). Reach: runway;');
});

it('preserves declared auto file nets when detector availability uses a detected framework', () => {
  const bp: Blueprint = { framework: 'auto', architecture: architecture() };

  expect(renderCompactProhibitions(bp, 'react')[1])
    .toContain('Governed files: src/domain/**/*.{js,jsx,ts,tsx,vue};');

  expect(renderCompactProhibitions(bp)[1])
    .toContain('Governed files: src/domain/**/*.{js,jsx,ts,tsx,vue};');
});

it.each(['agent', 'handbook'] as const)('%s separates scope from availability', (mode) => {
  const render = (context: ResolveArchitectureContext) => mode === 'agent'
    ? renderPlacement(architecture(), context)
    : renderArchitecture(architecture(), '', context);

  expect(render({ framework: 'react' }))
    .toContain('Governed files: src/domain/**/*.{js,jsx,ts,tsx};');

  expect(render({ framework: 'react', declaredFramework: 'auto' }))
    .toContain('Governed files: src/domain/**/*.{js,jsx,ts,tsx,vue};');

  expect(render({ framework: 'vue', declaredFramework: 'react' }))
    .toContain('Governed files: src/domain/**/*.{js,jsx,ts,tsx};');

  expect(render({ framework: 'react', declaredFramework: 'auto' }))
    .not.toContain('.Governed files:');
});
