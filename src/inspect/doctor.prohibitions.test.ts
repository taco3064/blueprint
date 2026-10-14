import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Blueprint } from '../config';
import { emitLint } from '../emit/lint';
import { runDoctor } from './doctor';

const directories: string[] = [];

afterEach(() => {
  for (const root of directories.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('runDoctor prohibition module loading', () => {
  it('uses the injected ESLint module to verify the emitted prohibition carrier', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-doctor-prohibitions-'));

    directories.push(root);

    const blueprint: Blueprint = { framework: 'react', architecture: {
      alias: '@', layerFiles: 'src/{layer}/**/*.js', layers: [{
        name: 'domain', does: 'policy', layout: 'file', mustNot: [{
          id: 'render-ui', description: 'render UI', checks: [{ call: 'divIcon' }],
        }],
      }],
    } };

    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), 'export default {};');

    fs.writeFileSync(path.join(root, 'eslint.config.mjs'),
      'import { emitLint } from \'@kekkai/blueprint\'; export default [];');

    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/policy.js'), 'export const policy = true;');

    const loadModule = vi.fn(async () => ({ ESLint: class extends ESLint {
      constructor(options: ESLint.Options) {
        super({ ...options, overrideConfigFile: true, overrideConfig: emitLint(blueprint) });
      }
    } }));

    const result = await runDoctor(root, {
      loadConfig: async () => blueprint, loadModule, log: () => {},
    });

    expect(loadModule).toHaveBeenCalledWith('eslint', root);
    expect(result.prohibitions).toHaveLength(2);

    expect(result.prohibitions).toEqual(Array.from({ length: 2 }, () => expect.objectContaining({
      layer: 'domain', id: 'render-ui', lintIntegration: 'verified',
      status: 'active', gate: 'passed', affectsExit: false,
    })));
  });
});
