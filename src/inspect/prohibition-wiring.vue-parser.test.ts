import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import vueParser from 'vue-eslint-parser';
import tsParser from '@typescript-eslint/parser';
import { emitLint } from '../emit/lint';
import type { Blueprint } from '../config';
import { verifyProhibitions } from './prohibition-wiring';

const roots: string[] = [];

const blueprint: Blueprint = {
  framework: 'vue', architecture: {
    alias: '@', layerFiles: 'src/{layer}/**/*.vue', layers: [{
      name: 'domain', does: 'policy', mustNot: [{
        id: 'ui', description: 'UI', checks: [{ call: 'divIcon' }],
      }],
    }],
  },
};

afterEach(() => {
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

async function run(source?: string, scriptParser?: unknown) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-prohibition-vue-'));

  roots.push(root);
  const file = 'src/domain/Unit.vue';

  if (source !== undefined) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), source);
  }

  const entries = [...emitLint(blueprint), {
    files: ['**/*.vue'], languageOptions: {
      parser: vueParser, ecmaVersion: 2022 as const, sourceType: 'module' as const,
      parserOptions: { ...(scriptParser === undefined ? {} : { parser: scriptParser }) },
    },
  }];

  const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: entries });
  const lint = source === undefined ? [] : await eslint.lintFiles(path.join(root, file));

  const evidence = await verifyProhibitions({
    root, blueprint, wired: true,
    scanResult: { topDirs: [], files: source === undefined
      ? []
      : [{
          path: file, segments: ['domain', 'Unit.vue'], imports: [],
        }] },
    load: async () => ({ ESLint: class extends ESLint {
      constructor(options: ESLint.Options) {
        super({ ...options, overrideConfigFile: true, overrideConfig: entries });
      }
    } }),
  });

  return { evidence, messages: lint.flatMap((result) => result.messages) };
}

describe('effective Vue script parser evidence', () => {
  it('keeps intact JS-only Vue verified without requiring a TS delegate or existing source',
    async () => {
      const empty = await run();
      const javascript = await run('<script>divIcon()</script>');

      expect(empty.evidence).toHaveLength(1);
      expect(empty.evidence[0].gate).toBe('passed');

      expect(javascript.messages.filter((message) => message.ruleId === 'blueprint/must-not'))
        .toHaveLength(1);

      expect(javascript.evidence.every((fact) => fact.gate === 'passed')).toBe(true);
    });

  it('marks a script-disabled outer Vue parser unavailable without inventing a violation',
    async () => {
      const result = await run('<script>divIcon()</script>', false);

      expect(result.messages).toEqual([]);
      expect(result.evidence.every((fact) => fact.status === 'unavailable')).toBe(true);
      expect(result.evidence.every((fact) => fact.gate === 'unverified')).toBe(true);
      expect(result.evidence.every((fact) => fact.affectsExit === false)).toBe(true);
    });

  it('requires the actual TypeScript script to parse through the delegated parser', async () => {
    const source = '<script lang="ts">const value: string = "map"; divIcon(value)</script>';
    const absent = await run(source);
    const delegated = await run(source, tsParser);

    expect(absent.messages.some((message) => message.fatal)).toBe(true);

    expect(absent.evidence.find((fact) => fact.probeFile === 'src/domain/Unit.vue'))
      .toMatchObject({ status: 'unavailable', gate: 'unverified', affectsExit: false });

    expect(delegated.messages.filter((message) => message.ruleId === 'blueprint/must-not'))
      .toHaveLength(1);

    expect(delegated.evidence.every((fact) => fact.gate === 'passed')).toBe(true);
  });

  it('accepts a template-only source when script parsing remains available', async () => {
    const result = await run('<template><div>text</div></template>');

    expect(result.messages).toEqual([]);
    expect(result.evidence.every((fact) => fact.gate === 'passed')).toBe(true);
  });
});
