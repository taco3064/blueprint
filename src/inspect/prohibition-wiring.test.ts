import { describe, expect, it, vi } from 'vitest';
import { ESLint } from 'eslint';
import vueParser from 'vue-eslint-parser';
import { emitLint } from '../emit/lint';
import { resolveArchitecture } from '../config';
import type { Blueprint } from '../config';
import { plugin } from '../plugin';
import { prohibitionDoctorChecks, verifyProhibitions } from './prohibition-wiring';

const blueprint: Blueprint = {
  framework: 'react',
  architecture: { alias: '@', layers: [{ name: 'domain', does: 'policy', mustNot: [
    { id: 'ui', description: 'render UI', checks: [{ call: 'divIcon' }] },
  ] }] },
};

function config(bp = blueprint) {
  return {
    rules: { 'blueprint/must-not': [bp.emit?.lint?.severity ?? 'error', {
      prohibitions: resolveArchitecture(bp.architecture, {
        framework: bp.framework, severity: bp.emit?.lint?.severity,
      }).layers[0].prohibitions,
    }] as unknown[] },
    plugins: { blueprint: plugin },
    languageOptions: { parser: { meta: { name: 'typescript-eslint/parser' } } },
  };
}

function run(value: unknown, bp = blueprint, wired = true) {
  const calculate = vi.fn(async (_file: string) => value);

  return {
    calculate,
    result: verifyProhibitions({
      root: '/repo', blueprint: bp, scanResult: { topDirs: [], files: [] }, wired,
      load: async () => ({ ESLint: class { calculateConfigForFile = calculate; } }),
    }),
  };
}

describe('verifyProhibitions', () => {
  it('verifies the real emitted future module carrier on an empty runway', async () => {
    const bp = structuredClone(blueprint);

    bp.architecture.modules = [];
    bp.architecture.layerFiles = 'src/{module}/{layer}/**/*.js';
    const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: emitLint(bp) });

    const facts = await verifyProhibitions({
      root: process.cwd(), blueprint: bp, scanResult: { topDirs: [], files: [] }, wired: true,
      load: async () => ({ ESLint: class {
        calculateConfigForFile(file: string) { return eslint.calculateConfigForFile(file); }
      } }),
    });

    expect(facts).toHaveLength(1);

    expect(facts[0]).toMatchObject({
      reach: 'runway', gate: 'passed',
      probeFile: 'src/__blueprint_module__/domain/__blueprint_probe__.js',
    });
  });

  it('makes missing parser metadata visible for required reference checks', async () => {
    const bp = structuredClone(blueprint);

    bp.architecture.layerFiles = 'src/{layer}/**/*.ts';

    bp.architecture.layers[0].mustNot = [{ id: 'web', description: 'web', checks: [
      { global: 'WebSocket' },
    ] }];

    const effective = config(bp);

    effective.languageOptions = {} as typeof effective.languageOptions;

    expect((await run(effective, bp).result)[0]).toMatchObject({
      status: 'unavailable', gate: 'unverified', affectsExit: false,
    });
  });
});

describe('verifyProhibitions uncertainty', () => {
  it.each([null, 3, false])('fails an invalid carrier root value: %j', async (basePath) => {
    const effective = config();
    const options = effective.rules['blueprint/must-not'][1] as object;

    effective.rules['blueprint/must-not'][1] = { ...options, basePath };
    expect((await run(effective).result)[0]).toMatchObject({ gate: 'failed', affectsExit: true });
  });

  it.each([{ call: 'divIcon' }, { package: 'leaflet' }])(
    'keeps TypeScript syntax starvation unverified for %j', async (check) => {
      const bp = structuredClone(blueprint);

      bp.architecture.layerFiles = 'src/{layer}/**/*.ts';
      bp.architecture.layers[0].mustNot = [{ id: 'ui', description: 'UI', checks: [check] }];
      const effective = config(bp);

      effective.languageOptions.parser.meta.name = 'espree';

      expect((await run(effective, bp).result)[0]).toMatchObject({
        status: 'unavailable', gate: 'unverified', affectsExit: false,
      });
    },
  );

  it('accepts numeric warning severity without claiming a violation', async () => {
    const bp = structuredClone(blueprint);

    bp.emit = { lint: { severity: 'warn' } };
    const effective = config(bp);

    effective.rules['blueprint/must-not'][0] = 1;
    expect((await run(effective, bp).result).every((fact) => fact.gate === 'passed')).toBe(true);
  });

  it('distinguishes parser-starved checks from broken wiring at every extension', async () => {
    const bp = structuredClone(blueprint);

    bp.architecture.layers[0].mustNot = [{ id: 'ui', description: 'UI', checks: [
      { global: 'WebSocket' }, { capability: 'render-ui' }, { call: 'divIcon' },
    ] }];

    const effective = config(bp);

    effective.languageOptions.parser.meta.name = 'espree';
    const facts = await run(effective, bp).result;

    expect(facts.map((fact) => fact.gate)).toEqual([
      'passed', 'unverified', 'unverified', 'unverified',
    ]);

    expect(facts[1].status).toBe('unavailable');
    expect(facts.every((fact) => fact.affectsExit === false)).toBe(true);
  });

  it('keeps fully exempt nets and unrepresentable custom globs unverified', async () => {
    const bp = structuredClone(blueprint);

    bp.architecture.layerFilesIgnore = '**/*';
    const excluded = run(config(bp), bp);

    expect((await excluded.result)[0].gate).toBe('unverified');
    expect(excluded.calculate).not.toHaveBeenCalled();
    bp.architecture.layerFilesIgnore = [];
    bp.architecture.layerFiles = 'src/{layer}/[ab].ts';
    expect((await run(config(bp), bp).result)[0].gate).toBe('unverified');
  });

  it('retains calculate failures as unverified evidence', async () => {
    const facts = await verifyProhibitions({
      root: '/repo', blueprint, scanResult: { topDirs: [], files: [] }, wired: true,
      load: async () => ({ ESLint: class {
        async calculateConfigForFile() { throw new Error('cannot inspect'); }
      } }),
    });

    expect(facts.map((fact) => fact.gate)).toEqual(Array(4).fill('unverified'));
    expect(facts[0].reason).toBe('Error: cannot inspect');
  });
});

describe('verifyProhibitions carrier evidence', () => {
  it('accepts separate carrier objects with matching implementation and metadata', async () => {
    const effective = config();
    const carrier = plugin.rules!['must-not'];

    effective.plugins.blueprint = { rules: { 'must-not': { ...carrier } } };
    expect((await run(effective).result)[0].gate).toBe('passed');

    effective.plugins.blueprint = { rules: {
      'must-not': { ...carrier, meta: { docs: { description: 'stale' } } },
    } };

    expect((await run(effective).result)[0].gate).toBe('failed');
  });

  it('resolves deferred framework evidence and checks Vue parser support', async () => {
    const bp = structuredClone(blueprint);

    bp.framework = 'vue';

    bp.architecture.layers[0].mustNot = [{ id: 'ui', description: 'UI', checks: [
      { capability: 'render-ui' },
    ] }];

    const effective = config(bp);

    Object.assign(effective.languageOptions.parser, vueParser);
    bp.framework = 'auto';

    const facts = await verifyProhibitions({
      root: '/repo', blueprint: bp, scanResult: { topDirs: [], files: [] }, wired: true,
      detectedFramework: 'vue',
      load: async () => ({ ESLint: class {
        async calculateConfigForFile() { return effective; }
      } }),
    });

    expect(facts.at(-1)).toMatchObject({ gate: 'passed', probeFile: expect.stringMatching(/\.vue$/) });
  });
});

describe('verifyProhibitions exact carrier controls', () => {
  it('verifies exact carrier against synthetic source before files exist', async () => {
    const { calculate, result } = run(config());
    const facts = await result;

    expect(calculate).toHaveBeenCalledTimes(4);
    expect(calculate.mock.calls[0][0]).toMatch(/domain[\\/]__blueprint_probe__\.js$/);

    expect(facts[0]).toMatchObject({ gate: 'passed',
      affectsExit: false,
      reach: 'vacuous',
      lintIntegration: 'verified' });

    expect(prohibitionDoctorChecks(facts)[0]).toEqual({
      sourceKey: JSON.stringify([
        'prohibition', facts[0].position, facts[0].id, facts[0].probeFile,
      ]),
      label: expect.any(String), ok: true });
  });

  it.each(['missing',
    'disabled',
    'severity',
    'stale',
    'replaced'])('fails a proven %s carrier',
    async (kind) => {
      const effective = config();

      if (kind === 'missing') {
        effective.rules = {} as typeof effective.rules;
      }

      if (kind === 'disabled') {
        effective.rules['blueprint/must-not'][0] = 0;
      }

      if (kind === 'severity') {
        effective.rules['blueprint/must-not'][0] = 'warn';
      }

      if (kind === 'stale') {
        effective.rules['blueprint/must-not'][1] = { prohibitions: [] };
      }

      if (kind === 'replaced') {
        effective.plugins.blueprint = { rules: { 'must-not': { create: () => ({}) } } };
      }

      const facts = await run(effective).result;

      expect(facts[0]).toMatchObject({ gate: 'failed',
        affectsExit: true,
        lintIntegration: 'failed' });

      expect(prohibitionDoctorChecks(facts)[0].ok).toBe(false);
    });

  it('does not downgrade missing wiring at warning severity', async () => {
    const bp = structuredClone(blueprint);

    bp.emit = { lint: { severity: 'warn' } };
    expect((await run(config(bp), bp, false).result)[0].gate).toBe('failed');
    expect((await run(config(bp), bp).result)[0].gate).toBe('passed');
  });

  it('marks unavailable effective config unverified without an exit failure', async () => {
    const facts = await run(undefined).result;

    expect(facts[0]).toMatchObject({ gate: 'unverified', affectsExit: false });

    expect(prohibitionDoctorChecks(facts)[0]).toMatchObject({ ok: true,
      skipped: expect.any(String) });
  });

  it('preserves partially available checks as unverified with intact wiring', async () => {
    const bp = structuredClone(blueprint);

    bp.framework = 'auto';

    bp.architecture.layers[0].mustNot = [{ id: 'state', description: 'state', checks: [
      { capability: 'react-state' }, { call: 'state' },
    ] }];

    expect((await run(config(bp),
      bp).result)[0]).toMatchObject({ status: 'partial',
      gate: 'unverified',
      affectsExit: false });
  });

  it('reports load errors as unverified and never invokes ESLint for review-only doctrine',
    async () => {
      const load = vi.fn(async () => {
        throw new Error('unavailable');
      });

      const input = { root: '/repo',
        blueprint,
        scanResult: { topDirs: [],
          files: [] },
        wired: true,
        load };

      expect((await verifyProhibitions(input))[0].gate).toBe('unverified');
      const bp = structuredClone(blueprint);

      bp.architecture.layers[0].mustNot = ['render UI'];
      load.mockClear();
      expect(await verifyProhibitions({ ...input, blueprint: bp })).toEqual([]);
      expect(load).not.toHaveBeenCalled();
    });
});
