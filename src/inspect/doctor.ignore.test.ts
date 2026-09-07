import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { defineBlueprint } from '../config';
import { vuePreset } from '../presets';
import { runDoctor } from './doctor';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-doctor-ignore-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x' }));
  fs.writeFileSync(path.join(root, 'eslint.config.mjs'), 'export default [];');
  fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), 'export default {};');
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));
  fs.mkdirSync(path.join(root, 'src/pages'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/pages/Home.vue'), '<template />');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const detailFor = async (layerFiles: string | undefined, layerFilesIgnore: string | undefined) => {
  const preset = vuePreset();

  const blueprint = defineBlueprint({
    ...preset,
    architecture: { ...preset.architecture, layerFiles, layerFilesIgnore },
  });

  const result = await runDoctor(root, { loadConfig: async () => blueprint, log: () => {} });

  return result.checks.find((check) => check.label.includes('architecture'))?.detail ?? '';
};

describe('runDoctor · layerFilesIgnore coverage', () => {
  it('does not prescribe moving a layer file that was deliberately ignored', async () => {
    const detail = await detailFor(undefined, 'src/pages/**');

    expect(detail).toContain('lint ignored: src/pages/Home.vue');
    expect(detail).not.toContain('vacuous');
    expect(detail).not.toContain('move code');
  });

  it('keeps the vacuous diagnosis for a layer glob that matches nothing', async () => {
    const detail = await detailFor('src/{layer}/**/*.jsx', undefined);

    expect(detail).toContain('clean, but vacuous');
    expect(detail).toContain('move code');
  });
});
