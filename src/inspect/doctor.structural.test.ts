import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { emitLint } from '../emit/lint';
import { runDoctor } from './doctor';

const roots: string[] = [];

afterEach(() => {
  while (roots.length) {
    fs.rmSync(roots.pop() as string, { recursive: true, force: true });
  }
});

function blueprint(alias = '~app'): Blueprint {
  return {
    name: 'fixture',
    framework: 'vue',
    architecture: {
      alias,
      layers: [
        { name: 'components', does: 'render UI' },
        { name: 'services', does: 'data access' },
      ],
    },
    emit: { agents: [] },
    rules: { unusedVars: 'error' },
  };
}

function removeFirstStructuralGroup(entry: Record<string, unknown>): Record<string, unknown> {
  const rules = entry.rules as Record<string, unknown> | undefined;
  const restriction = rules?.['no-restricted-imports'];

  if (!Array.isArray(restriction) || typeof restriction[1] !== 'object') {
    return entry;
  }

  const options = restriction[1] as { patterns?: unknown[] };

  if (options.patterns?.length) {
    options.patterns = options.patterns.slice(1);
  }

  return entry;
}

function eslintConfig(
  current: Blueprint,
  mutation: 'none' | 'remove-required' | 'add-unrelated',
): string {
  const entries = emitLint(current).map((entry) => {
    const { plugins, ...rest } = entry;

    const rendered = mutation === 'remove-required'
      ? removeFirstStructuralGroup(JSON.parse(JSON.stringify(rest)) as Record<string, unknown>)
      : rest;

    if (mutation === 'add-unrelated') {
      const rules = rendered.rules as Record<string, unknown> | undefined;
      const restriction = rules?.['no-restricted-imports'];

      if (Array.isArray(restriction) && typeof restriction[1] === 'object') {
        const options = restriction[1] as { patterns?: unknown[] };

        options.patterns = [...(options.patterns ?? []), {
          group: ['unrelated-package/**'],
          message: 'fixture-only unrelated restriction',
        }];
      }
    }

    return plugins
      ? `{ ...${JSON.stringify(rendered)}, plugins: { blueprint: stub } }`
      : JSON.stringify(rendered);
  });

  return [
    '// wired from @kekkai/blueprint emitLint — inlined for the fixture',
    'const stubRule = {',
    '  meta: { schema: [{ type: \'object\', additionalProperties: true }] },',
    '  create: () => ({}),',
    '};',
    'const stub = { rules: {',
    '  \'relative-escape\': stubRule,',
    '  \'import-boundary\': stubRule,',
    '} };',
    `export default [${entries.join(',')}];`,
  ].join('\n');
}

function repo(
  current: Blueprint,
  mutation: 'none' | 'remove-required' | 'add-unrelated' = 'none',
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-doctor-structural-'));

  const put = (relative: string, content: string): void => {
    const file = path.join(root, relative);

    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  roots.push(root);
  spawnSync('git', ['init'], { cwd: root });
  put('package.json', JSON.stringify({ scripts: { lint: 'eslint .' } }));
  put('blueprint.config.mjs', '// fixture');
  put('eslint.config.mjs', eslintConfig(current, mutation));

  put('tsconfig.json', JSON.stringify({
    compilerOptions: { paths: { [`${current.architecture.alias}/*`]: ['./src/*'] } },
  }));

  put('src/components/Button.vue', '<template><div /></template>');
  put('src/services/api.ts', 'export const api = 1;');

  return root;
}

describe('runDoctor · emitted structural normalization', () => {
  it('accepts a leading-hash alias from actual emitLint output', async () => {
    const current = blueprint('#');

    const result = await runDoctor(repo(current), {
      loadConfig: async () => current,
      log: () => {},
    });

    const survival = result.checks.find((entry) => entry.label.includes('emitted rules survive'));

    expect(survival).toMatchObject({ ok: true });
    expect(survival?.skipped).toBeUndefined();
  });

  it('rejects actual emitted output after a structural restriction is removed', async () => {
    const current = blueprint();

    const result = await runDoctor(repo(current, 'remove-required'), {
      loadConfig: async () => current,
      log: () => {},
    });

    const survival = result.checks.find((entry) => entry.label.includes('emitted rules survive'));

    expect(survival).toMatchObject({ ok: false });
    expect(survival?.detail).toContain('structural pattern group(s)');
  });

  it('keeps required semantics visible when an unrelated restriction is added', async () => {
    const current = blueprint('#');

    const result = await runDoctor(repo(current, 'add-unrelated'), {
      loadConfig: async () => current,
      log: () => {},
    });

    const survival = result.checks.find((entry) => entry.label.includes('emitted rules survive'));

    expect(survival).toMatchObject({ ok: true });
    expect(survival?.skipped).toBeUndefined();
  });
});
