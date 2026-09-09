import tsParser from '@typescript-eslint/parser';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import vueParser from 'vue-eslint-parser';

import type { Blueprint } from '../../config';
import { importBoundary } from '../../plugin/import-boundary';
import { emitLint } from './lint';
import type { LintConfigEntry } from './types';

function moduleBlueprint(): Blueprint {
  return {
    framework: 'react',
    architecture: {
      alias: '~app',
      sourceRoot: 'src',
      additionalAliases: {
        '~root': '.',
        '~source': 'src',
        '~b': 'src/b_module',
        '~bHooks': 'src/b_module/hooks',
        '~useB': 'src/b_module/hooks/useB',
      },
      modules: [
        { name: 'a_module', does: 'A', dependsOn: ['b_module'] },
        { name: 'b_module', does: 'B' },
        { name: 'isolated', does: 'isolated' },
      ],
      layers: [
        { name: 'components', does: 'UI', layout: 'folder' },
        { name: 'hooks', does: 'state', layout: 'folder' },
        { name: 'services', does: 'I/O' },
      ],
    },
  };
}

function lint(
  code: string,
  filename: string,
  blueprint = moduleBlueprint(),
): Linter.LintMessage[] {
  const parser: LintConfigEntry[] = filename.endsWith('.vue')
    ? [{
        files: ['**/*.vue'],
        languageOptions: { parser: vueParser, parserOptions: { parser: tsParser } },
      }]
    : /\.[cm]?tsx?$/.test(filename)
      ? [{ files: ['**/*.{ts,tsx,mts,cts}'], languageOptions: { parser: tsParser } }]
      : [];

  return new Linter({ configType: 'flat' }).verify(
    code,
    [...parser, ...emitLint(blueprint)],
    { filename },
  );
}

function ruleIds(code: string, filename: string, blueprint?: Blueprint): string[] {
  const messages = lint(code, filename, blueprint);

  expect(messages.filter((message) => message.fatal)).toEqual([]);

  return messages.map((message) => message.ruleId).filter((id): id is string => id !== null);
}

describe('emitLint · canonical cross-boundary alias', () => {
  it('stays inert without architecture options or outside the declared source root', () => {
    const linter = new Linter({ configType: 'flat' });

    const base = {
      files: ['**/*.{js,ts}'],
      plugins: { blueprint: { rules: { 'import-boundary': importBoundary } } },
      rules: { 'blueprint/import-boundary': 'error' as const },
    };

    expect(linter.verify('import("~elsewhere/x")', base, { filename: 'src/x.ts' })).toEqual([]);

    expect(linter.verify(
      'import("~b/hooks/useB")',
      {
        ...base,
        rules: {
          'blueprint/import-boundary': ['error', { architecture: moduleBlueprint().architecture }],
        },
      },
      { filename: 'outside/x.ts' },
    )).toEqual([]);
  });

  it.each([
    ['~root/src/b_module/hooks/useB', '~app/b_module/hooks/useB'],
    ['~source/b_module/hooks/useB', '~app/b_module/hooks/useB'],
    ['~b/hooks/useB', '~app/b_module/hooks/useB'],
    ['~bHooks/useB', '~app/b_module/hooks/useB'],
    ['~useB', '~app/b_module/hooks/useB'],
  ])('rejects static %s and recommends %s', (secondary, canonical) => {
    const messages = lint(
      `import value from "${secondary}";`,
      'src/a_module/components/Card/index.tsx',
    );

    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'blueprint/import-boundary',
        message: expect.stringContaining(`"${canonical}"`),
      }),
    ]));
  });

  it('allows the canonical spelling and ordinary external packages', () => {
    expect(ruleIds(
      'import useB from "~app/b_module/hooks/useB"; import React from "react";',
      'src/a_module/components/Card/index.tsx',
    )).not.toContain('blueprint/import-boundary');
  });

  it('allows canonical descendants that also match a longer additional alias', () => {
    const blueprint = moduleBlueprint();

    blueprint.architecture.additionalAliases = {
      '~app/b_module': 'src/b_module',
    };

    const messages = new Linter({ configType: 'flat' }).verify(
      'import useB from "~app/b_module/hooks/useB";',
      [{
        files: ['**/*.tsx'],
        languageOptions: { parser: tsParser },
        plugins: { blueprint: { rules: { 'import-boundary': importBoundary } } },
        rules: {
          'blueprint/import-boundary': ['error', { architecture: blueprint.architecture }],
        },
      }],
      { filename: 'src/a_module/components/Card/index.tsx' },
    );

    expect(messages).toEqual([]);
  });

  it('applies the same canonical rule to layer-first flow', () => {
    const blueprint: Blueprint = {
      framework: 'react',
      architecture: {
        alias: '~app',
        additionalAliases: { '~hooks': 'src/hooks' },
        layers: [
          { name: 'components', does: 'UI' },
          { name: 'hooks', does: 'state', layout: 'folder' },
        ],
      },
    };

    expect(ruleIds(
      'import useThing from "~hooks/useThing";',
      'src/components/Card.tsx',
      blueprint,
    )).toContain('blueprint/import-boundary');

    expect(ruleIds(
      'import useThing from "~app/hooks/useThing";',
      'src/components/Card.tsx',
      blueprint,
    )).not.toContain('blueprint/import-boundary');

    expect(ruleIds(
      'import("~app/hooks/useThing/internal")',
      'src/components/Card/index.tsx',
      blueprint,
    )).toContain('blueprint/import-boundary');
  });
});

describe('emitLint · dynamic import parity', () => {
  const importer = 'src/a_module/hooks/useA.ts';

  it('applies canonical spelling to literal and bounded static expressions', () => {
    for (const code of [
      'import("~b/services/api")',
      'const root = "~b/"; import(root + "services/api")',
      'const layer = "services"; import(`~b/${layer}/api`)',
    ]) {
      expect(ruleIds(code, importer)).toContain('blueprint/import-boundary');
    }

    expect(ruleIds('import("~app/b_module/services/api")', importer))
      .not.toContain('blueprint/import-boundary');
  });

  it('composes module and inner direction independently', () => {
    expect(ruleIds(
      'import("~app/b_module/components/Card")',
      importer,
    )).toContain('blueprint/import-boundary');

    expect(ruleIds(
      'import("~app/a_module/hooks/useA")',
      'src/b_module/hooks/useB.ts',
    )).toContain('blueprint/import-boundary');

    expect(ruleIds(
      'import("~app/b_module/components/Card")',
      'src/a_module/components/Local/index.tsx',
    )).not.toContain('blueprint/import-boundary');
  });

  it('preserves same-layer and folder-unit entry boundaries', () => {
    expect(ruleIds(
      'import("~app/a_module/hooks/useOther")',
      importer,
    )).toContain('blueprint/import-boundary');

    expect(ruleIds(
      'import("~app/b_module/hooks/useB")',
      'src/a_module/components/Card/index.tsx',
    )).not.toContain('blueprint/import-boundary');

    expect(ruleIds(
      'import("~app/b_module/hooks/useB/internal")',
      'src/a_module/components/Card/index.tsx',
    )).toContain('blueprint/import-boundary');
  });

  it('does not invent a verdict for mutated, shadowed, or runtime targets', () => {
    const cases = [
      'let target = "~b/services/api"; target = runtime; import(target)',
      'const target = "~b/services/api"; function load(target) { return import(target) }',
      'import(`~b/services/${window.name}`)',
    ];

    for (const code of cases) {
      expect(ruleIds(code, importer)).not.toContain('blueprint/import-boundary');
    }
  });

  it.each([
    [
      'TypeScript',
      'src/a_module/hooks/useA.ts',
      'const p: string = "~b/services"; import(`${p}/api`)',
    ],
    [
      'Vue',
      'src/a_module/hooks/useA.vue',
      '<script setup lang="ts">const p = "~b/services" as const; import(`${p}/api`)</script>',
    ],
  ])('runs through the real %s parser path', (_label, filename, code) => {
    const blueprint = moduleBlueprint();

    blueprint.framework = filename.endsWith('.vue') ? 'vue' : 'react';

    expect(ruleIds(code, filename, blueprint)).toContain('blueprint/import-boundary');
  });

  it('keeps static and bounded dynamic relative imports on the same carrier', () => {
    const staticIds = ruleIds('import "../components/Card";', importer);

    const dynamicIds = ruleIds(
      'const target = "../components/Card"; import(target)',
      importer,
    );

    expect(staticIds).toEqual(['blueprint/relative-escape']);
    expect(dynamicIds).toEqual(staticIds);
  });
});
