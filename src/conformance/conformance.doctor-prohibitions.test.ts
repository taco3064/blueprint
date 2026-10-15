import { ESLint } from 'eslint';
import { afterEach, expect, it, vi } from 'vitest';
import type { Blueprint } from '../config';
import { emitLint } from '../emit/lint';
import * as project from '../project';
import { cli, configSource, makeRepo, read, rm } from './conformance';

const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();

  for (const root of roots.splice(0)) {
    rm(root);
  }
});

function fixture() {
  const blueprint: Blueprint = { framework: 'react', architecture: {
    alias: '@', layers: [{ name: 'domain', does: 'policy', layout: 'file', mustNot: [
      { id: 'network', description: 'No network', checks: [{ capability: 'network-io' }] },
      'Review policy semantics',
    ] }],
  }, emit: { agents: [] } };

  const config = configSource(blueprint);

  const root = makeRepo({ files: {
    'blueprint.config.mjs': config,
    'eslint.config.mjs': 'import { emitLint } from "@kekkai/blueprint"; export default [];',
    'src/domain/policy.js': 'export const policy = true;\n',
  } });

  roots.push(root);

  vi.spyOn(project, 'loadProjectModule').mockImplementation(async () => ({
    ESLint: class extends ESLint {
      constructor(options: ESLint.Options) {
        super({ ...options, overrideConfigFile: true, overrideConfig: emitLint(blueprint) });
      }
    },
  }));

  return { root, config };
}

it('Doctor CLI retains mixed JavaScript and unavailable TypeScript probes', async () => {
  const { root, config } = fixture();
  const result = await cli(root, ['doctor', '--json']);

  expect(result.code, result.output).toBe(0);
  const report = JSON.parse(result.output);

  expect(report.prohibitions.map((fact: { probeFile: string; status: string; gate: string }) =>
    [fact.probeFile, fact.status, fact.gate])).toEqual([
    ['src/domain/policy.js', 'active', 'passed'],
    ['src/domain/__blueprint_probe__.js', 'active', 'passed'],
    ['src/domain/__blueprint_probe__.jsx', 'unavailable', 'unverified'],
    ['src/domain/__blueprint_probe__.ts', 'unavailable', 'unverified'],
    ['src/domain/__blueprint_probe__.tsx', 'unavailable', 'unverified'],
  ]);

  const probes = report.assessment.items.filter((item: { id: string; sourceKey: string }) =>
    item.id === 'doctor-check' && item.sourceKey.startsWith('["prohibition",'));

  expect(probes).toHaveLength(5);
  expect(new Set(probes.map((item: { sourceKey: string }) => item.sourceKey)).size).toBe(5);
  expect(report.assessment.gates.status).toBe('unverified');

  expect(report.assessment.items.filter((item: { id: string }) => item.id === 'must-not-review'))
    .toEqual([expect.objectContaining({ status: 'review-required', lane: 'review' })]);

  expect(read(root, 'blueprint.config.mjs')).toBe(config);
  expect(read(root, 'src/domain/policy.js')).toBe('export const policy = true;\n');
});

it('Doctor text output retains active and unavailable per-probe evidence', async () => {
  const { root } = fixture();
  const text = await cli(root, ['doctor']);

  expect(text.code, text.output).toBe(0);
  expect(text.output).toContain('availability active; gate passed');
  expect(text.output).toContain('availability unavailable; gate unverified');
  expect(text.output).not.toContain('Conflicting');
});
