import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

import { defineBlueprint } from '../../config';
import { emitLint } from './lint';

/**
 * `defaultGlob` (patterns.ts) builds the `files` glob `emitLint` actually
 * emits for `blueprint/relative-escape` — the glob that decides which files
 * the rule ever sees. `relative-escape.source-root.test.ts` proves the
 * RULE reads a normalized `sourceRoot` correctly once handed a file; every
 * one of its cases hand-rolls `files: ['**']` or `files: ['**\/*.ts']`, so
 * none of them prove the emitted glob hands the rule a file at all. This
 * file closes that gap: real `emitLint()`, its real `files` glob, real
 * on-disk files, real `ESLint#lintFiles`.
 *
 * Before this fix, `defaultGlob` string-concatenated a raw, un-normalized
 * `sourceRoot` and produced a double slash for any normalized-but-not-bare-'.'
 * form. Measured directly (not assumed): under this repo's own `eslint`
 * dependency, that double-slash glob happened to still match real files for
 * a multi-segment root ('./lib/app/' → './lib/app//...') — but for './'
 * ('.//...') `ESLint#lintFiles` threw `AllFilesIgnoredError` outright, because
 * no config entry's `files` matched anything. One shape broke loudly, the
 * other passed by luck of the glob matcher — neither is something to build on.
 */
describe('emitLint · the real emitted files glob actually reaches real files', () => {
  const layers = [{ name: 'components', does: 'UI' as const }];

  /** Write `filesByPath` under a fresh tmp dir, run the emitted config against it. */
  async function lintAgainstRealFiles(
    sourceRoot: string,
    filesByPath: Record<string, string>,
  ): Promise<Map<string, string[]>> {
    const blueprint = defineBlueprint({
      framework: 'react',
      architecture: { alias: '~app', sourceRoot, layers },
    });

    const config = emitLint(blueprint);

    const escapeEntry = config.find(
      (entry) => entry.rules && 'blueprint/relative-escape' in entry.rules,
    );

    // The regression pin itself: no double slash in the glob this test then
    // proves reaches real files.
    expect(escapeEntry?.files?.some((glob) => glob.includes('//'))).toBe(false);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-source-root-glob-'));

    try {
      for (const [relPath, contents] of Object.entries(filesByPath)) {
        const abs = path.join(dir, relPath);

        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, contents);
      }

      const eslint = new ESLint({
        cwd: dir,
        overrideConfigFile: true,
        overrideConfig: [
          { languageOptions: { ecmaVersion: 2022, sourceType: 'module' } },
          ...config,
        ],
      });

      const results = await eslint.lintFiles(['**/*.tsx']);

      return new Map(
        results.map((result) => [
          path.relative(dir, result.filePath).split(path.sep).join('/'),
          result.messages.map((message) => message.ruleId ?? ''),
        ]),
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it('sourceRoot: "./lib/app/" — reaches and flags a file that leaves its layer', async () => {
    const byFile = await lintAgainstRealFiles('./lib/app/', {
      'lib/app/components/Button.tsx':
        'import x from "../services/api";\nexport default x;\n',
      'lib/app/components/Card.tsx': 'import x from "./Button";\nexport default x;\n',
    });

    expect(byFile.size).toBe(2);
    expect(byFile.get('lib/app/components/Button.tsx')).toContain('blueprint/relative-escape');
    expect(byFile.get('lib/app/components/Card.tsx')).toEqual([]);
  });

  it('sourceRoot: "./" — reaches and flags a file that leaves its layer', async () => {
    // The shape that hard-failed pre-fix: `.//components/**` matched nothing at
    // all, and `ESLint#lintFiles` threw `AllFilesIgnoredError` rather than
    // silently linting zero files — proving the glob, not just the rule, is
    // what this project-root layout depended on.
    const byFile = await lintAgainstRealFiles('./', {
      'components/Button.tsx': 'import x from "../services/api";\nexport default x;\n',
      'components/Card.tsx': 'import x from "./Button";\nexport default x;\n',
    });

    expect(byFile.size).toBe(2);
    expect(byFile.get('components/Button.tsx')).toContain('blueprint/relative-escape');
    expect(byFile.get('components/Card.tsx')).toEqual([]);
  });
});
