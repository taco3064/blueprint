import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { resolveArchitecture } from '../config';
import type { Blueprint, Framework } from '../config';
import { plugin } from '../plugin';
import { verifyProhibitions } from './prohibition-wiring';

function blueprint(): Blueprint {
  return { framework: 'react', emit: {}, architecture: { alias: '@',
    layerFiles: 'src/{layer}/**/*.js', layers: [
      { name: 'ui', does: 'UI', mustNot: ['review UI'] },
      { name: 'domain', does: 'policy', mustNot: [
        'review policy',
        { id: 'calls', description: 'calls', checks: [{ call: 'divIcon' }] },
        { id: 'state', description: 'state', checks: [{ capability: 'react-state' }] },
      ] },
    ] } };
}

function config(bp: Blueprint) {
  return { rules: { 'blueprint/must-not': ['error', {
    prohibitions: resolveArchitecture(bp.architecture, { framework: bp.framework })
      .layers[1].prohibitions.filter((entry) => entry.mode === 'executable'),
  }] }, plugins: { blueprint: plugin }, languageOptions: {} };
}

async function run(value: unknown, bp = blueprint(), detectedFramework?: Framework | null) {
  const calculate = vi.fn(async (_file: string) => value);

  const facts = await verifyProhibitions({ root: '/repo', blueprint: bp,
    detectedFramework, scanResult: { topDirs: [], files: [] }, wired: true,
    load: async () => ({ ESLint: class { calculateConfigForFile = calculate; } }),
  });

  return { facts, calculate };
}

describe('prohibition carrier controls', () => {
  it('preserves layer and entry identity beside review-only declarations', async () => {
    const bp = blueprint();
    const { facts } = await run(config(bp), bp);

    expect(facts.map((fact) => [fact.layer, fact.id, fact.mode, fact.gate])).toEqual([
      ['domain', 'calls', 'executable', 'passed'],
      ['domain', 'state', 'executable', 'passed'],
    ]);
  });

  it('preserves the unavailable configuration reason and probe path', async () => {
    const { facts } = await run(undefined);

    expect(facts[0]).toMatchObject({ gate: 'unverified',
      reason: 'Effective configuration unavailable for src/domain/__blueprint_probe__.js.',
      probeFile: 'src/domain/__blueprint_probe__.js' });
  });

  it('resolves parser availability for the later executable layer', async () => {
    const bp = blueprint();

    bp.architecture.layerFiles = 'src/{layer}/**/*.ts';
    const { facts } = await run(config(bp), bp);

    expect(facts).toMatchObject([
      { layer: 'domain', id: 'calls', status: 'unavailable', gate: 'unverified',
        checks: [{ check: { call: 'divIcon' }, status: 'unavailable',
          unavailableReason: 'Required source syntax parser support is unavailable.' }] },
      { layer: 'domain', id: 'state', status: 'unavailable', gate: 'unverified',
        checks: [{ check: { capability: 'react-state' }, status: 'unavailable',
          unavailableReason: 'Required source syntax parser support is unavailable.' }] },
    ]);
  });

  it.each([
    ['no rules', (value: Record<string, unknown>) => { delete value.rules; }],
    ['no options', (value: Record<string, unknown>) => {
      value.rules = { 'blueprint/must-not': 'error' };
    }],
    ['no plugins', (value: Record<string, unknown>) => { delete value.plugins; }],
    ['no blueprint', (value: Record<string, unknown>) => { value.plugins = {}; }],
    ['no plugin rules', (value: Record<string, unknown>) => { value.plugins = { blueprint: {} }; }],
    ['no carrier', (value: Record<string, unknown>) => {
      value.plugins = { blueprint: { rules: {} } };
    }],
    ['missing create', (value: Record<string, unknown>) => {
      value.plugins = { blueprint: { rules: {
        'must-not': { meta: plugin.rules!['must-not'].meta },
      } } };
    }],
    ['replaced create', (value: Record<string, unknown>) => {
      value.plugins = { blueprint: { rules: {
        'must-not': { ...plugin.rules!['must-not'], create: () => ({}) },
      } } };
    }],
  ] as const)('fails a %s carrier without converting it to uncertainty', async (_name, alter) => {
    const bp = blueprint();
    const effective = config(bp);

    alter(effective);
    const { facts } = await run(effective, bp);

    expect(facts.map((fact) => fact.gate)).toEqual(['failed', 'failed']);

    expect(facts[0].reason).toBe(
      'Missing, disabled, replaced, or mismatched blueprint/must-not '
      + 'at src/domain/__blueprint_probe__.js.',
    );
  });

  it('retains ESLint load failure evidence instead of a later undefined-engine error', async () => {
    const facts = await verifyProhibitions({ root: '/repo', blueprint: blueprint(),
      scanResult: { topDirs: [], files: [] }, wired: true,
      load: async () => { throw new Error('ESLint package missing'); } });

    expect(facts.map((fact) => fact.reason)).toEqual([
      'Error: ESLint package missing', 'Error: ESLint package missing',
    ]);
  });

  it('keeps an explicit framework authoritative over detection', async () => {
    const bp = blueprint();
    const { facts } = await run(config(bp), bp, 'vue');

    expect(facts.map((fact) => fact.gate)).toEqual(['passed', 'passed']);
  });

  it('keeps automatic framework unresolved without detection', async () => {
    const bp = blueprint();

    bp.framework = 'auto';
    const { facts } = await run(config(bp), bp);

    expect(facts.map((fact) => [fact.status, fact.gate])).toEqual([
      ['active', 'passed'], ['unavailable', 'unverified'],
    ]);
  });

  it('excludes hidden matched probes using wildcard exemptions', async () => {
    const bp = blueprint();

    bp.architecture.layerFiles = 'src/{layer}/.hidden/*.js';
    bp.architecture.layerFilesIgnore = '**/*';
    const { calculate, facts } = await run(config(bp), bp);

    expect(calculate).not.toHaveBeenCalled();
    expect(facts.map((fact) => fact.gate)).toEqual(['unverified', 'unverified']);
  });

  it('preserves filename suffixes after brace groups', async () => {
    const bp = blueprint();

    bp.architecture.layerFiles = 'src/{layer}/{one,two}.js';
    const { calculate } = await run(config(bp), bp);

    expect(calculate.mock.calls.map(([file]) => file)).toEqual([
      path.join('/repo', 'src/domain/one.js'), path.join('/repo', 'src/domain/one.js'),
    ]);
  });
});
