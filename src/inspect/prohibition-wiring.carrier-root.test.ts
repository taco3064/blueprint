import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { emitLint } from '../emit/lint';
import { resolveArchitecture } from '../config';
import type { Blueprint } from '../config';
import { verifyProhibitions } from './prohibition-wiring';

const roots: string[] = [];

const blueprint: Blueprint = {
  framework: 'react', architecture: {
    alias: '@', layerFiles: 'src/{layer}/**/*.js', layers: [{
      name: 'domain', does: 'policy', mustNot: [{
        id: 'ui', description: 'UI', checks: [{ call: 'divIcon' }], exempt: ['unit.js'],
      }],
    }],
  },
};

afterEach(() => {
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

function fixture(basePath?: string) {
  const lintRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-prohibition-root-'));

  roots.push(lintRoot);
  const root = path.resolve(lintRoot, basePath ?? '.');

  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/domain/unit.js'), 'divIcon();');

  return { root, lintRoot };
}

async function measure(roots: { root: string; lintRoot: string },
  entries: ReturnType<typeof emitLint>) {
  const eslint = new ESLint({ cwd: roots.lintRoot,
    overrideConfigFile: true,
    overrideConfig: entries });

  const [lint] = await eslint.lintFiles(path.join(roots.root, 'src/domain/unit.js'));

  const evidence = await verifyProhibitions({
    ...roots, blueprint, wired: true, scanResult: { topDirs: [], files: [] },
    load: async () => ({ ESLint: class extends ESLint {
      constructor(options: ESLint.Options) {
        super({ ...options, overrideConfigFile: true, overrideConfig: entries });
      }
    } }),
  });

  return { violations: lint.messages.filter((message) => message.ruleId === 'blueprint/must-not'),
    evidence };
}

function override(basePath: unknown) {
  return { rules: { 'blueprint/must-not': ['error', {
    prohibitions: resolveArchitecture(blueprint.architecture, { framework: 'react' })
      .layers[0].prohibitions,
    basePath,
  }] } } as ReturnType<typeof emitLint>[number];
}

describe('prohibition carrier application root', () => {
  it('fails an exemption-root change that silences the real lint violation', async () => {
    const roots = fixture();
    const normal = await measure(roots, emitLint(blueprint));
    const altered = await measure(roots, [...emitLint(blueprint), override('src/domain')]);

    expect(normal.violations).toHaveLength(1);
    expect(normal.evidence[0].gate).toBe('passed');
    expect(altered.violations).toHaveLength(0);
    expect(altered.evidence[0]).toMatchObject({ gate: 'failed', affectsExit: true });
  });

  it.each(['.', './src/..'])('accepts equivalent application roots: %s', async (basePath) => {
    const result = await measure(fixture(), [...emitLint(blueprint), override(basePath)]);

    expect(result.violations).toHaveLength(1);
    expect(result.evidence[0].gate).toBe('passed');
  });

  it('uses the actual workspace lint cwd for a legitimate scoped emitter', async () => {
    const roots = fixture('apps/client');
    const normal = await measure(roots, emitLint(blueprint, { basePath: 'apps/client' }));

    expect(normal.violations).toHaveLength(1);
    expect(normal.evidence[0].gate).toBe('passed');

    const changed = await measure(roots, [
      ...emitLint(blueprint, { basePath: 'apps/client' }), override('.'),
    ]);

    expect(changed.evidence[0].gate).toBe('failed');
  });
});
