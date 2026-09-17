import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { reactPreset, vuePreset } from '../presets';
import { cli, configSource, flattenProse, makeRepo, read, rm, write } from './conformance';

const dirs: string[] = [];

const presets = { react: reactPreset, vue: vuePreset } as const;

function repo(framework: 'react' | 'vue', files: Record<string, string> = {}): string {
  const dir = makeRepo({
    packageJson: { name: 'shop', dependencies: { [framework]: '^3' } },
    files,
  });

  dirs.push(dir);

  return dir;
}

function stubPackage(dir: string, blueprint: Blueprint): void {
  const packageRoot = path.join(dir, 'node_modules/@kekkai/blueprint');
  const body = `() => (${JSON.stringify(blueprint)})`;

  fs.mkdirSync(packageRoot, { recursive: true });

  fs.writeFileSync(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({ type: 'module', exports: './index.mjs' }),
  );

  fs.writeFileSync(
    path.join(packageRoot, 'index.mjs'),
    `export const reactPreset = ${body};\nexport const vuePreset = ${body};\n`,
  );
}

function sourceDirs(dir: string): string[] {
  const src = path.join(dir, 'src');

  return fs.existsSync(src) ? fs.readdirSync(src) : [];
}

afterEach(() => {
  while (dirs.length) {
    rm(dirs.pop() as string);
  }
});

describe.each(['react', 'vue'] as const)('%s greenfield adoption', (framework) => {
  const preset = presets[framework];

  it.each([
    ['layer-first', `export default ${framework}Preset({ name: 'shop' });`],
    ['module-first', `export default ${framework}Preset({ name: 'shop', modules: [] });`],
  ] as const)('initializes %s from the framework preset', async (topology, declaration) => {
    const dir = repo(framework);
    const result = await cli(dir, ['init', '--topology', topology, '--no-install']);
    const handbook = read(dir, 'docs/architecture-handbook.md') ?? '';
    const canonical = preset(topology === 'module-first' ? { modules: [] } : {});

    expect(result.code, result.output).toBe(0);
    expect(read(dir, 'blueprint.config.mjs')).toContain(declaration);
    expect(read(dir, 'blueprint-authoring.md')).toBeNull();

    expect(Object.keys(canonical.rules ?? {}).filter((id) => !handbook.includes(`| \`${id}\` |`)))
      .toEqual([]);

    expect(handbook).toContain('## Principles');
    expect(handbook).toContain('## Working playbook');
    expect(handbook).toContain('## Component shape');
    expect(handbook.includes('`deepWatch`')).toBe(framework === 'vue');
  });

  it('opens an empty module-first runway without inventing a module folder', async () => {
    const dir = repo(framework);
    const result = await cli(dir, ['init', '--topology', 'module-first', '--no-install']);
    const handbook = read(dir, 'docs/architecture-handbook.md') ?? '';
    const contract = flattenProse(read(dir, 'CLAUDE.md') ?? '');

    expect(result.code, result.output).toBe(0);
    expect(flattenProse(result.output)).toContain('Proven-empty application (0 source files)');
    expect(sourceDirs(dir)).toEqual([]);
    expect(handbook).toContain('## Module growth protocol');
    expect(handbook).not.toMatch(/\| `(?:shared|core|common|app)` \|/);

    expect(contract)
      .toContain('- Module runway: `architecture.modules` declares no domain module yet');

    expect(contract).toContain('follow the module growth protocol in');
  });

  it('keeps the runway module-first across inspect, deps, doctor, and repair', async () => {
    const dir = repo(framework);

    await cli(dir, ['init', '--topology', 'module-first', '--no-install']);
    stubPackage(dir, preset({ name: 'shop', modules: [] }));
    write(dir, 'src/main.ts', 'export const boot = 1;\n');

    const inspect = await cli(dir, ['inspect', '--json']);
    const deps = await cli(dir, ['deps']);
    const doctor = await cli(dir, ['doctor', '--json']);
    const repair = await cli(dir, ['init', '--no-install']);

    expect(JSON.parse(inspect.output)).toMatchObject({ ok: true, findings: [] });
    expect(deps.code, deps.output).toBe(0);
    expect(doctor.output).not.toContain('Cannot read properties');
    expect(repair.code, repair.output).toBe(0);
    expect(repair.output).not.toContain('transformation');
    expect(read(dir, 'blueprint.config.mjs')).toContain('modules: []');
  });

  it('repairs an untouched runway when module-first is requested again', async () => {
    const dir = repo(framework);

    await cli(dir, ['init', '--topology', 'module-first', '--no-install']);
    stubPackage(dir, preset({ name: 'shop', modules: [] }));

    const repeat = await cli(dir, ['init', '--topology', 'module-first', '--no-install']);

    expect(repeat.code, repeat.output).toBe(0);
    expect(repeat.output).not.toContain('transformation');

    expect(read(dir, 'blueprint.config.mjs'))
      .toContain(`${framework}Preset({ name: 'shop', modules: [] })`);
  });

  it('forces a proven-empty authoring brief back to the canonical runway', async () => {
    const dir = repo(framework);

    const result = await cli(dir, [
      'init', '--topology', 'module-first', '--authoring', '--no-install',
    ]);

    const playbook = flattenProse(read(dir, 'blueprint-authoring.md') ?? '');

    expect(result.code, result.output).toBe(0);

    expect(flattenProse(result.output))
      .toContain('the playbook\'s own verdict will be the canonical module-first runway');

    expect(playbook).toContain('this application is proven-empty');
    expect(read(dir, 'blueprint.config.mjs')).toBeNull();
  });
});

describe('brownfield module-first adoption stays a safe ratchet', () => {
  it('authors existing source without the canonical gate set or folder-name modules', async () => {
    const dir = repo('react', {
      'src/checkout/hooks/cart.ts': 'export const cart = 1;\n',
      'src/catalog/components/List.tsx': 'export const List = 1;\n',
    });

    const result = await cli(dir, ['init', '--topology', 'module-first', '--no-install']);
    const playbook = flattenProse(read(dir, 'blueprint-authoring.md') ?? '');

    expect(result.code, result.output).toBe(0);
    expect(read(dir, 'blueprint.config.mjs')).toBeNull();
    expect(playbook).toContain('module-first was selected');
    expect(playbook).toContain('**Never derive a module from vocabulary.**');
    expect(playbook).toContain('Brownfield adoption translates existing house thresholds only');
    expect(playbook).toContain('rules: { cycles: \'error\', unusedVars: \'error\' }');
    expect(playbook).not.toContain('codeStyle: \'error\'');
    expect(playbook).not.toContain('this application is proven-empty');
    expect(playbook).not.toContain('ordinary top-level folders below `sourceRoot` as module');
  });

  it('keeps the layer-first authoring sketch free of module-first keys', async () => {
    const dir = repo('react', Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [
        `src/legacy/mod${index}.ts`, 'export const x = 1;\n',
      ]),
    ));

    await cli(dir, ['init', '--topology', 'layer-first', '--no-install']);

    const playbook = read(dir, 'blueprint-authoring.md') ?? '';

    expect(playbook).toContain('its presence, even `modules: []`, selects module-first');
    expect(playbook).not.toMatch(/^\s+modules: \[/m);
  });
});

describe('module-first runway authority in guarded transformation', () => {
  it('accepts an adopted runway as module-first authority for a layer-first request', async () => {
    const dir = repo('react');

    write(dir, 'blueprint.config.mjs', configSource(reactPreset({ name: 'shop', modules: [] })));

    const result = await cli(dir, ['init', '--topology', 'layer-first', '--no-install']);

    expect(result.output).not.toContain('requires the current module-first blueprint.config.mjs as '
      + 'authority');

    expect(result.output).toContain('Module-first → layer-first');
  });
});
