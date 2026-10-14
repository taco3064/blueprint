import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { defineBlueprint } from '../../config';
import { emitLint } from './lint';

function blueprint(options: {
  topology?: 'layer-first' | 'module-first';
  modules?: { name: string; does: string }[];
  severity?: 'error' | 'warn';
  exempt?: string[];
  layerFiles?: string[];
} = {}) {
  return defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '@', sourceRoot: 'app',
      layerFiles: options.layerFiles,

      ...(options.modules === undefined ? {} : { modules: options.modules }),
      layers: [{
        name: 'domain', does: 'policy', layout: 'file',

        mustNot: [
          'render UI',
          {
            id: 'network', description: 'network',
            checks: [{ global: 'fetch' }], exempt: options.exempt,
          },
          { id: 'call', description: 'call', checks: [{ call: 'divIcon' }] },
        ],
      }],
      layerFilesIgnore: ['app/**/ignored.js'],
    },
    emit: { lint: { severity: options.severity ?? 'error' } },
  });
}

function violations(filename: string, options: Parameters<typeof blueprint>[0] = {}) {
  return new Linter().verify('fetch("x"); divIcon()', emitLint(blueprint(options)), { filename })
    .filter((message) => message.ruleId === 'blueprint/must-not');
}

describe('emitted prohibitions', () => {
  it('enforces each declaration, preserves severity', () => {
    expect(violations('app/domain/unit.js')).toMatchObject([{ severity: 2 }, { severity: 2 }]);

    expect(violations('app/domain/unit.js', { severity: 'warn' }))
      .toMatchObject([{ severity: 1 }, { severity: 1 }]);
  });

  it.each([
    'app/other/unit.js', 'src/domain/unit.js',
    'app/domain/ignored.js', 'app/domain/unit.test.js',
  ])(
    'respects structural scope %s', (filename) => {
      expect(violations(filename)).toEqual([]);
    },
  );

  it('applies exemptions independently after the layer file net', () => {
    const messages = violations('app/domain/unit.js', { exempt: ['app/**/unit.js'] });

    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain('call');
    expect(violations('app/domain/other.js', { exempt: ['app/**/unit.js'] })).toHaveLength(2);
  });

  it('uses declared layer file patterns', () => {
    const options = { layerFiles: ['custom/{layer}/**/*.js'] };

    expect(violations('app/domain/unit.js', options)).toEqual([]);
    expect(violations('app/custom/domain/unit.js', options)).toHaveLength(2);
  });

  it('enforces every module position and future runway positions', () => {
    const options = { topology: 'module-first' as const, modules: [
      { name: 'one', does: 'one' }, { name: 'two', does: 'two' },
    ] };

    expect(violations('app/one/domain/unit.js', options)).toHaveLength(2);
    expect(violations('app/two/domain/unit.js', options)).toHaveLength(2);

    expect(violations('app/future/domain/unit.js', {
      topology: 'module-first', modules: [],
    })).toHaveLength(2);
  });

  it('resolves auto framework via the caller stack facts', () => {
    const source = blueprint();

    source.framework = 'auto';

    source.architecture.layers[0].mustNot = [{
      id: 'state', description: 'state', checks: [{ capability: 'react-state' }],
    }];

    const entry = emitLint(source, { detectedFramework: 'react' })
      .find((item) => item.rules?.['blueprint/must-not']);

    expect(entry?.rules?.['blueprint/must-not']).toMatchObject(['error', {
      prohibitions: [{ status: 'active', checks: [{ status: 'available' }] }],
    }]);
  });
});

describe('prohibition emitter absence controls', () => {
  it('has no carrier for review-only doctrine or an omitted prohibition', () => {
    const source = blueprint();

    source.emit = undefined;
    source.architecture.layers[0].mustNot = ['fetch'];
    expect(emitLint(source).some((entry) => entry.rules?.['blueprint/must-not'])).toBe(false);
    source.architecture.layers[0].mustNot = undefined;
    expect(emitLint(source).some((entry) => entry.rules?.['blueprint/must-not'])).toBe(false);
  });

  it('defaults executable severity to error', () => {
    const source = blueprint();

    source.emit = undefined;

    expect(emitLint(source).find((entry) => entry.rules?.['blueprint/must-not'])?.rules)
      .toMatchObject({ 'blueprint/must-not': ['error', expect.any(Object)] });
  });
});

describe('prohibition framework authority', () => {
  it.each([
    { framework: 'react', capability: 'react-state', name: 'useState' },
    { framework: 'vue', capability: 'vue-reactivity', name: 'ref' },
  ] as const)('preserves authored $framework and resolves only auto', (row) => {
    const source = defineBlueprint({
      framework: row.framework,
      architecture: { alias: '@', layers: [{
        name: 'domain', does: 'policy', mustNot: [{
          id: 'state', description: 'state', checks: [{ capability: row.capability }],
        }],
      }] },
    });

    const code = `import { ${row.name} } from '${row.framework}'; ${row.name}();`;
    const control = `function ${row.name}() {}; ${row.name}();`;
    const filename = 'src/domain/unit.js';

    for (const detectedFramework of [undefined, 'react', 'vue'] as const) {
      const config = emitLint(source, { detectedFramework });

      expect(new Linter().verify(code, config, { filename })).toMatchObject([
        { ruleId: 'blueprint/must-not', severity: 2 },
      ]);

      expect(new Linter().verify(control, config, { filename })).toEqual([]);
      const automatic = emitLint({ ...source, framework: 'auto' }, { detectedFramework });
      const messages = new Linter().verify(code, automatic, { filename });

      expect(messages).toHaveLength(detectedFramework === row.framework ? 1 : 0);
      expect(new Linter().verify(control, automatic, { filename })).toEqual([]);
    }
  });
});
