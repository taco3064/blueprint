import path from 'node:path';
import { ESLint, Linter } from 'eslint';
import { afterEach, describe, expect, it } from 'vitest';

import { emitLint } from '../emit/lint';
import { reactPreset } from '../presets';
import { makeRepo, react, rm } from './conformance';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    rm(dirs.pop() as string);
  }
});

describe('emitted lint and Inspect share folder-unit boundaries', () => {
  const blueprint = reactPreset();
  const linter = new Linter({ configType: 'flat' });

  const config = [
    { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
    ...emitLint(blueprint, { basePath: 'apps/web' }),
  ];

  const filename = 'apps/web/src/components/Card/src/view/Row.js';

  const rules = (code: string, file = filename): (string | null)[] =>
    linter.verify(code, config, { filename: file })
      .map((message) => message.ruleId)
      .filter((rule) => rule === 'blueprint/relative-escape' || rule === 'no-restricted-imports');

  it('rejects relative and canonical spellings of the same forbidden boundary', () => {
    expect(rules('import api from "../../../../services/api";'))
      .toContain('blueprint/relative-escape');

    expect(rules('import api from "~app/services/api";'))
      .toContain('no-restricted-imports');
  });

  it('preserves legal unit imports and rejects sibling internals', () => {
    expect(rules('import Cell from "../Cell";')).toEqual([]);
    expect(rules('import Other from "../../../Other";')).toEqual([]);

    expect(rules('import Other from "../../../Other/src/private";'))
      .toContain('blueprint/relative-escape');
  });

  it('covers re-exports and supported dynamic imports without governing sibling apps', () => {
    expect(rules('export { api } from "../../../../services/api";'))
      .toContain('blueprint/relative-escape');

    expect(rules('const api = await import("../../../../services/api");'))
      .toContain('blueprint/relative-escape');

    expect(rules(
      'import api from "../../../../services/api";',
      'apps/admin/src/components/Card/src/view/Row.js',
    )).toEqual([]);
  });

  it('keeps an absolute application base stable from repository and application cwd', async () => {
    const dir = makeRepo({
      packageJson: react(),
      files: {
        'apps/web/src/components/Card/src/view/Bad.js':
          'import api from "../../../../services/api";',
        'apps/web/src/components/Card/src/view/Good.js': 'import Cell from "../Cell";',
      },
    });

    const application = path.join(dir, 'apps/web');
    const emitted = emitLint(blueprint, { basePath: application });

    dirs.push(dir);

    for (const cwd of [dir, application]) {
      const eslint = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: emitted });

      const [bad] = await eslint.lintFiles([
        path.join(application, 'src/components/Card/src/view/Bad.js'),
      ]);

      const [good] = await eslint.lintFiles([
        path.join(application, 'src/components/Card/src/view/Good.js'),
      ]);

      expect(bad.messages.map((message) => message.ruleId))
        .toContain('blueprint/relative-escape');

      expect(good.messages.filter((message) => message.ruleId?.startsWith('blueprint/')))
        .toEqual([]);
    }
  });
});
