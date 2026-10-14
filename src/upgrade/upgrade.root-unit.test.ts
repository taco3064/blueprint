import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Blueprint } from '../config';
import { reactPreset, vuePreset } from '../presets';
import type { GitReader } from '../project';
import { runUpgrade } from './upgrade';

let root: string;

const write = (file: string, value: unknown) => {
  const target = path.join(root, file);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value));
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-root-upgrade-'));
  write('package.json', { devDependencies: { '@kekkai/blueprint': '^4.2.0' } });
  write('blueprint.config.mjs', 'export default {};');

  write('node_modules/@kekkai/blueprint/package.json', {
    name: '@kekkai/blueprint', version: '4.2.0',
  });

  checkpoint('4.1.0');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function checkpoint(version: string): void {
  write('.blueprint-lifecycle.json', {
    schema: 1, blueprint: version, provenance: 'complete', operations: [], pending: null,
    applications: {},
  });
}

const git: GitReader = (args) => ({
  status: 0, stderr: '',
  stdout: args[0] === 'status' ? '' : args[1] === '--show-toplevel' ? root : 'true',
});

const custom = (name: string, does: string): Blueprint => ({
  framework: 'react', architecture: {
    alias: '~app', modules: [{ name: 'shop', does: 'commerce' }], layers: [{ name, does }],
  },
});

const configurations = [
  ['react preset', reactPreset({ modules: [] })],
  ['vue preset', vuePreset({ modules: [] })],
  ['custom views', custom('views', 'Renders presentation from view models')],
  ['custom unclear', custom('helpers', 'Application helpers')],
  ['custom name-only', custom('components', 'Application work')],
] as const;

function options(blueprint: Blueprint) {
  return {
    git, running: { root: '/runner', version: '4.2.0' }, log: () => {},
    loadConfig: async () => blueprint, reconcile: vi.fn(async () => {}),
  };
}

describe('root-unit manual upgrade through production catalog', () => {
  it.each(configurations)('keeps custom roles owner-reviewed: %s', async (_name, blueprint) => {
    const before = JSON.stringify(blueprint);

    expect(await runUpgrade(root, options(blueprint))).toBe(1);
    const text = fs.readFileSync(path.join(root, 'blueprint-upgrade.md'), 'utf8');

    expect(text).toContain('review-module-root-unit');

    expect(text).toContain('Only unchanged canonical React/Vue preset guidance recommends '
      + '`components`');

    expect(text).toContain('Every custom architecture requires owner decision');

    expect(text).toContain('unique `views.does` presentation prose. No runtime-selected '
      + 'owner exists');

    expect(text).toContain('Blueprint never chooses the\npublic API');
    expect(text).toContain('retain the files in place');
    expect(text).toContain('no empty barrel');
    expect(JSON.stringify(blueprint)).toBe(before);
    expect(fs.existsSync(path.join(root, 'src/components'))).toBe(false);

    expect(await runUpgrade(root, {
      ...options(blueprint), complete: 'review-module-root-unit',
    })).toBe(0);

    expect(JSON.parse(fs.readFileSync(path.join(root, '.blueprint-lifecycle.json'), 'utf8'))
      .pending.completed).toEqual(['review-module-root-unit']);
  });

  it('does not request review for an adoption first established at 4.2', async () => {
    checkpoint('4.2.0');
    const settings = options(reactPreset({ modules: [] }));

    expect(await runUpgrade(root, settings)).toBe(0);
    expect(settings.reconcile).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(root, 'blueprint-upgrade.md'))).toBe(false);
  });
});
