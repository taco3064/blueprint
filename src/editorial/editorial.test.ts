import { describe, expect, it } from 'vitest';

import { defineBlueprint, resolveArchitecture } from '../config';
import { emitLint } from '../emit/lint';
import { emptyTestGlobs } from '../emit/lint/patterns';
import { dropTestFiles } from '../inspect/filter';
import type { ScanResult } from '../inspect/types';
import {
  renderEmptyTestFilesEditorial,
  renderResolvedTestFilesEditorial,
  renderTestFilesEditorial,
  renderUnreachedTestFilesEditorial,
  TEST_FILES_SEMANTIC_NODE,
} from './editorial';
import type { EditorialLocale, TestFilesEdition } from './editorial';

const testFiles = ['**/*.check.ts'];

const blueprint = defineBlueprint({
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'pages', does: 'routes' },
      { name: 'services', does: 'network' },
    ],
    testFiles,
  },
  rules: { maxLines: 'error', testFilename: 'error' },
});

describe('architecture.testFiles editorial policy', () => {
  it('renders every edition and locale for both matching and empty policies', () => {
    const editions: TestFilesEdition[] = [
      'agent-placement',
      'core',
      'deps',
      'gate-availability',
      'merge-scope',
      'reference',
      'survey',
    ];

    const locales: EditorialLocale[] = ['en', 'zh-TW'];

    expect(TEST_FILES_SEMANTIC_NODE).toBe('architecture.testFiles');

    for (const edition of editions) {
      for (const locale of locales) {
        expect(renderTestFilesEditorial(edition, locale)).toBeTruthy();
        expect(renderTestFilesEditorial(edition, locale, [])).toBeTruthy();
      }

      expect(renderTestFilesEditorial(edition, 'en'))
        .not.toBe(renderTestFilesEditorial(edition, 'zh-TW'));

      expect(renderTestFilesEditorial(edition, 'en')).not.toMatch(/\p{Script=Han}/u);
      expect(renderTestFilesEditorial(edition, 'zh-TW')).toMatch(/\p{Script=Han}/u);

      expect(renderTestFilesEditorial(edition, 'en', []))
        .not.toBe(renderTestFilesEditorial(edition, 'zh-TW', []));

      expect(renderTestFilesEditorial(edition, 'en', [])).not.toMatch(/\p{Script=Han}/u);
      expect(renderTestFilesEditorial(edition, 'zh-TW', [])).toMatch(/\p{Script=Han}/u);
    }
  });

  it('renders measured reach and all of its localized fact fields', () => {
    const locales: EditorialLocale[] = ['en', 'zh-TW'];

    for (const locale of locales) {
      expect(renderEmptyTestFilesEditorial(locale)).toBeTruthy();

      const complete = renderUnreachedTestFilesEditorial(locale, {
        deadGlobs: ['tests/**', '**/*.check.ts', '!**/*.gen.ts'],
        allGlobsDead: true,
        outsideScan: [{ glob: 'tests/**', reason: 'outside source root' }],
        undecidedGlobs: ['**/*.check.ts'],
        divergentGlobs: ['!**/*.gen.ts'],
      });

      expect(complete).toContain('architecture.testFiles');

      if (locale === 'zh-TW') {
        expect(complete).toContain(
          '此處沒有檔案匹配 `tests/**`、`**/*.check.ts`、`!**/*.gen.ts`',
        );

        expect(complete).toContain('超出掃描範圍：`tests/**` — outside source root');
        expect(complete).toContain('`**/*.check.ts` 可能是拼錯的 glob');
        expect(complete).toContain('`!**/*.gen.ts` 在掃描器與 ESLint 中的解讀不同');
      }

      expect(renderUnreachedTestFilesEditorial(locale, {
        deadGlobs: ['**/*.check.ts'],
        allGlobsDead: false,
        outsideScan: [],
        undecidedGlobs: [],
        divergentGlobs: [],
      })).toContain('architecture.testFiles');
    }
  });

  it('feeds lint, inspect, and both localized editions from one resolved policy', () => {
    const policy = resolveArchitecture(blueprint.architecture).testFiles;
    const lint = emitLint(blueprint);
    const structural = lint.find((entry) => entry.rules?.['blueprint/relative-escape']);
    const metric = lint.find((entry) => entry.rules?.['max-lines']);

    const testRule = lint.find(
      (entry) => entry.rules?.['blueprint/test-filename-matches-source'],
    );

    const scan: ScanResult = {
      topDirs: ['pages'],
      files: [
        { path: 'src/pages/a.ts', segments: ['pages', 'a.ts'], imports: [] },
        { path: 'src/pages/a.check.ts', segments: ['pages', 'a.check.ts'], imports: [] },
      ],
    };

    expect(structural?.ignores).toEqual(policy.architectureExemptions);
    expect(metric?.ignores).toEqual(policy.architectureExemptions);
    expect(testRule?.files).toEqual(policy.testRuleFiles);
    expect(dropTestFiles(scan, blueprint.architecture.testFiles).files).toEqual([scan.files[0]]);

    for (const locale of ['en', 'zh-TW'] as const) {
      const edition = renderResolvedTestFilesEditorial('core', locale, policy);

      expect(edition).toContain('**/*.check.ts');
      expect(edition).not.toContain('**/*.test.{js,jsx,ts,tsx,vue}');
    }
  });

  it('makes an empty owner move behavior and both editions together', () => {
    const empty = resolveArchitecture({ ...blueprint.architecture, testFiles: [] }).testFiles;

    const lint = emitLint(defineBlueprint({
      ...blueprint,
      architecture: { ...blueprint.architecture, testFiles: [] },
    }));

    expect(empty.architectureExemptions).toEqual([]);
    expect(empty.testRuleFiles).toEqual([]);
    expect(emptyTestGlobs([])).toContain('exempts nothing');
    expect(emptyTestGlobs(undefined)).toBeNull();

    expect(lint.some((entry) => entry.rules?.['blueprint/test-filename-matches-source']))
      .toBe(false);

    expect(renderResolvedTestFilesEditorial('core', 'en', empty)).toContain('exempts nothing');

    expect(renderResolvedTestFilesEditorial('core', 'zh-TW', empty))
      .toContain('不會讓任何檔案豁免');
  });
});

it('keeps agent placement locale direction observable', () => {
  expect(renderTestFilesEditorial('agent-placement', 'en'))
    .toContain('Test support matching');

  expect(renderTestFilesEditorial('agent-placement', 'zh-TW'))
    .toContain('測試支援檔');

  expect(renderTestFilesEditorial('agent-placement', 'en', []))
    .toContain('exempts no test support');

  expect(renderTestFilesEditorial('agent-placement', 'zh-TW', []))
    .toContain('不會讓任何測試支援檔豁免');
});

it('keeps every editorial edition dispatch distinct', () => {
  const editions: TestFilesEdition[] = [
    'agent-placement',
    'core',
    'deps',
    'gate-availability',
    'merge-scope',
    'reference',
    'survey',
  ];

  for (const locale of ['en', 'zh-TW'] as const) {
    const rendered = editions.map((edition) => renderTestFilesEditorial(edition, locale));

    expect(new Set(rendered)).toHaveLength(editions.length);
  }
});
