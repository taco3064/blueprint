import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { emitLint } from '../emit/lint';
import { gateFacts } from '../emit/agent/sections';
import { emitHandbook } from '../emit/docs';
import { expectedCarriers } from './wiring';
import { enforcedBy, unavailableForEmit, unavailableGate } from '../emit/lint/patterns';
import type { Blueprint, RuleSetting } from '../config';
import { computeCoverage } from './coverage';
import { runRules } from './rules';

const roots: string[] = [];

const layerFirst: Blueprint = {
  framework: 'react',
  architecture: { alias: '~app', layers: [{ name: 'domain', does: 'Logic' }] },
};

const moduleFirst: Blueprint = {
  ...layerFirst,
  architecture: { ...layerFirst.architecture, modules: [] },
};

function repo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-sync-rules-'));

  roots.push(root);
  fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), 'export default {};');
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fixture"}');

  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('moduleDependencySync catalog', () => {
  it.each([undefined, 'off', 'warn', 'error'] as const)(
    'reports %s availability independently of lint severity', async (setting) => {
      for (const blueprint of [moduleFirst, layerFirst]) {
        const config: Blueprint = {
          ...blueprint,
          rules: setting ? { moduleDependencySync: setting } : {},
          emit: { lint: { severity: setting === 'warn' ? 'error' : 'warn' } },
        };

        const messages: string[] = [];

        const result = await runRules(repo(), {
          loadConfig: async () => config, json: true, log: (line) => messages.push(line),
        });

        const gate = result.gates.find(({ id }) => id === 'moduleDependencySync');

        expect(gate).toMatchObject({
          id: 'moduleDependencySync',
          emits: 'inspect (module dependency reconciliation)',
          runtime: 'inspect',
          active: blueprint === moduleFirst && (setting === 'warn' || setting === 'error'),
          declared: setting ? { tier: setting } : null,
        });

        expect(gate?.unavailable === undefined).toBe(blueprint === moduleFirst);
        expect(JSON.parse(messages[0]).gates).toContainEqual(gate);
      }
    },
  );

  it('only marks the module gate unavailable on layer-first', () => {
    const stack = { framework: 'react', hasTypescript: true };

    expect(unavailableGate('moduleDependencySync', stack)).toBeNull();

    expect(unavailableGate('moduleDependencySync', { ...stack, topology: 'module-first' }))
      .toBeNull();

    expect(unavailableForEmit('moduleDependencySync', { topology: 'layer-first' }))
      .toContain('module-first');

    expect(unavailableGate('cycles', { ...stack, topology: 'layer-first' })).toBeNull();
    expect(enforcedBy('moduleDependencySync')).toBe('inspect');
  });

  it('changes the optional gate denominator only for module-first and never emits ESLint', () => {
    const scan = { files: [], topDirs: [] };
    const layer = computeCoverage(scan, layerFirst, true);
    const module = computeCoverage(scan, moduleFirst, true);

    expect(module.gatedRules).toBe(layer.gatedRules + 1);

    for (const setting of ['off', 'warn', 'error'] as RuleSetting[]) {
      const config = { ...moduleFirst, rules: { moduleDependencySync: setting } };

      expect(emitLint(config)).toEqual(emitLint(moduleFirst));
      expect(computeCoverage(scan, config, true).activeRules).toBe(setting === 'off' ? 0 : 1);

      expect(computeCoverage(scan, {
        ...layerFirst, rules: { moduleDependencySync: setting },
      }, true).activeRules).toBe(0);
    }
  });

  it('keeps generated gate facts topology-aware and outside Doctor lint carriers', () => {
    const rules = { moduleDependencySync: 'error' as const };
    const active = { ...moduleFirst, rules };
    const unavailable = { ...layerFirst, rules };

    expect(gateFacts(active)).toEqual([
      { id: 'moduleDependencySync', setting: 'error', holder: 'inspect' },
    ]);

    expect(gateFacts(unavailable)).toEqual([]);
    expect(emitHandbook(active)).toContain('inspect');
    expect(emitHandbook(unavailable)).toContain('module-first');
    expect(expectedCarriers(active, true)).toEqual([]);

    expect(expectedCarriers({
      ...active, rules: { ...rules, explicitAny: 'error' },
    }, true)).toEqual([
      { gate: 'explicitAny', rule: '@typescript-eslint/no-explicit-any',
        carrier: 'typescript', typescriptOnly: true },
    ]);
  });
});
