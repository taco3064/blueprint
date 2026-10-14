import { expect, it } from 'vitest';
import type { Blueprint } from '../../config';
import { emitHandbook } from '../docs';
import { emitAgentContract } from './agent';

function blueprint(): Blueprint {
  return { framework: 'auto', architecture: { alias: '@', layers: [{
    name: 'domain', does: 'policy', mustNot: ['change policy', {
      id: 'state', description: 'own state', checks: [{ capability: 'react-state' }],
    }, { id: 'call', description: 'render UI', checks: [{ call: 'divIcon' }] }],
  }] }, emit: { lint: { severity: 'warn' } } };
}

it.each(['handbook', 'agent', 'compact'] as const)('%s preserves prohibition facts', (surface) => {
  const render = (detectedFramework?: 'react') => surface === 'handbook'
    ? emitHandbook(blueprint(), { detectedFramework })
    : emitAgentContract(blueprint(), { compact: surface === 'compact', detectedFramework });

  const unresolved = render();
  const resolved = render('react');

  expect(unresolved).toContain('change policy [review only; no machine carrier]');
  expect(unresolved).toContain('state: own state [unavailable');
  expect(resolved).toContain('state: own state [lint backed');
  expect(resolved).toContain('severity warn');
  expect(resolved).toContain('non-blocking conformance observations');
  expect(resolved).not.toContain('[object Object]');
  expectDeclaredScope(resolved);
  expectDeclaredScope(unresolved);

  expect(resolved.indexOf('change policy')).toBeLessThan(resolved.indexOf('state: own state'));

  if (surface !== 'compact') {
    expect(resolved).toContain('not semantic identity proof');
  }
});

function expectDeclaredScope(text: string): void {
  expect(text).toContain('Governed files: src/domain/**/*.{js,jsx,ts,tsx,vue};');
  expect(text).not.toContain('.Governed files:');
  expect(text).toContain('Reach: unmeasured;');
  expect(text).toContain('ignores: **/*.test.{js,jsx,ts,tsx,vue}, **/*.spec.{js,jsx,ts,tsx,vue}');
}
