import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ESLint, Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { plugin } from './plugin';

const linter = new Linter({ configType: 'flat' });

const LAYOUTS = { components: 'flat', resources: 'folder' } as const;

function messageIds(
  code: string,
  filename: string,
  options: { sourceRoot?: string; root?: string } = {},
): string[] {
  return linter
    .verify(
      code,
      {
        files: ['**'],
        plugins: { blueprint: plugin },
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: {
          'blueprint/relative-escape': ['error', { layouts: LAYOUTS, ...options }],
        },
      },
      { filename },
    )
    .map((message) => message.messageId ?? '');
}

describe('blueprint/relative-escape · sourceRoot: "app" (a non-default, legal root)', () => {
  it('catches a relative import that leaves its layer — silent before this fix', () => {
    // Before this fix, `srcSegments` only ever searched for a literal `src`
    // segment. Under `sourceRoot: 'app'` no file path contains one, so the
    // rule read every file here as outside the source root and reported
    // nothing — not a wrong verdict, total silence.
    expect(
      messageIds(
        'import x from "../resources/matches";',
        'app/components/Button.ts',
        { sourceRoot: 'app' },
      ),
    ).toEqual(['leavesFolder']);
  });

  it('still allows a legal same-folder relative import', () => {
    expect(
      messageIds('import x from "./Card";', 'app/components/Button.ts', { sourceRoot: 'app' }),
    ).toEqual([]);
  });

  it('composes with the module-axis `root` option — both options apply together', () => {
    // `escapeEntries` (src/emit/lint/lint.ts) spreads `root` and `sourceRoot` into
    // the same options object; this proves neither clobbers the other.
    const moduleLayouts = { hooks: 'flat', components: 'flat' } as const;

    const ids = linter
      .verify(
        'import x from "../Combat";',
        {
          files: ['**'],
          plugins: { blueprint: plugin },
          languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
          rules: {
            'blueprint/relative-escape': [
              'error',
              { layouts: moduleLayouts, root: 'Combat', sourceRoot: 'app' },
            ],
          },
        },
        { filename: 'app/Combat/hooks/useCombat.ts' },
      )
      .map((message) => message.messageId ?? '');

    // Reaching back to its own module root is the loophole the `root` option
    // closes — same as relative-escape.modules.test.ts, now under `app/` instead
    // of the hardcoded `src/`.
    expect(ids).toEqual(['leavesFolder']);
  });

  it('skips a file outside the configured source root entirely', () => {
    expect(
      messageIds(
        'import x from "../resources/matches";',
        'scripts/build.ts',
        { sourceRoot: 'app' },
      ),
    ).toEqual([]);

    // Still under `src/`, but the configured root is `app` — the old hardcoded
    // 'src' search would have wrongly matched this one.
    expect(
      messageIds(
        'import x from "../resources/matches";',
        'src/components/Button.ts',
        { sourceRoot: 'app' },
      ),
    ).toEqual([]);
  });
});

describe('blueprint/relative-escape · sourceRoot: "." (project-root layout, no anchor)', () => {
  it('catches a relative import that leaves its layer, given a relative filename', () => {
    // The low-level `Linter` API (used throughout this file, matching this
    // rule's own test convention) passes a relative filename through
    // unchanged, so it is already layer-relative — no `cwd` stripping needed.
    expect(
      messageIds(
        'import x from "../resources/matches";',
        'components/Button.ts',
        { sourceRoot: '.' },
      ),
    ).toEqual(['leavesFolder']);
  });

  it('still allows a legal same-folder relative import', () => {
    expect(
      messageIds('import x from "./Card";', 'components/Button.ts', { sourceRoot: '.' }),
    ).toEqual([]);
  });

  it('catches the same violation given the absolute filename real ESLint hands the rule', () => {
    // Confirmed against this repo's own `eslint` dependency: `ESLint#lintFiles`
    // resolves every `context.filename` to an absolute path before a rule ever
    // sees it. `sourceRoot: '.'` has no segment name to anchor on (there is no
    // wrapping directory at all), so the only way to find the project-root
    // boundary in an absolute path is `context.cwd` — this is the case that
    // would have stayed silently broken from a bare `sourceRoot` substitution
    // alone, since no path segment is ever literally named `.`.
    const cwdLinter = new Linter({ cwd: '/project', configType: 'flat' });

    const ids = cwdLinter
      .verify(
        'import x from "../resources/matches";',
        {
          files: ['**'],
          plugins: { blueprint: plugin },
          languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
          rules: {
            'blueprint/relative-escape': ['error', { layouts: LAYOUTS, sourceRoot: '.' }],
          },
        },
        { filename: '/project/components/Button.ts' },
      )
      .map((message) => message.messageId ?? '');

    expect(ids).toEqual(['leavesFolder']);
  });

  it('treats a trailing slash ("./") the same way — a related gap this fix also closes', () => {
    // Before this fix, only the exact string `'.'` took the no-anchor branch;
    // `'./'` fell into the segment search instead, and since no path segment
    // is ever literally named `./`, it silently matched nothing. Unifying the
    // branch on "zero normalized segments" (`dirSegments('./')` is `[]`, same
    // as `dirSegments('.')`) closes this alongside the multi-segment fix,
    // since both fixes read `sourceRoot` through the same normalization.
    expect(
      messageIds(
        'import x from "../resources/matches";',
        'components/Button.ts',
        { sourceRoot: './' },
      ),
    ).toEqual(['leavesFolder']);
  });
});

describe('blueprint/relative-escape · sourceRoot: "lib/app" (a multi-segment, legal root)', () => {
  it('catches a relative import that leaves its layer — silently broken before this fix', () => {
    // Before this fix, `srcSegments` searched for `sourceRoot` as one literal
    // array element (`parts.lastIndexOf(sourceRoot)`). A multi-segment root
    // like `lib/app` can never appear as a single element once the filename
    // is split on path separators, so the rule read every file here as
    // outside the source root and reported nothing — the same silent
    // non-enforcement `bc0d8a5` closed for `'app'` and `'.'`, just for this
    // shape of legal, already-supported input (`config/graph.test.ts` already
    // exercises `sourceRoot: 'lib/app'` for `aliasLayerRoots`).
    expect(
      messageIds(
        'import x from "../resources/matches";',
        'lib/app/components/Button.ts',
        { sourceRoot: 'lib/app' },
      ),
    ).toEqual(['leavesFolder']);
  });

  it('still allows a legal same-folder relative import', () => {
    expect(
      messageIds(
        'import x from "./Card";',
        'lib/app/components/Button.ts',
        { sourceRoot: 'lib/app' },
      ),
    ).toEqual([]);
  });

  it('normalizes a leading "./" and trailing "/" the same way as the bare form', () => {
    expect(
      messageIds(
        'import x from "../resources/matches";',
        'lib/app/components/Button.ts',
        { sourceRoot: './lib/app/' },
      ),
    ).toEqual(['leavesFolder']);

    expect(
      messageIds(
        'import x from "./Card";',
        'lib/app/components/Button.ts',
        { sourceRoot: './lib/app/' },
      ),
    ).toEqual([]);
  });

  it(
    'catches the violation against real on-disk files through ESLint#lintFiles, not just the '
    + 'low-level Linter API',
    async () => {
      // The low-level `Linter` tests above prove the segment math; this proves
      // it against what real ESLint actually hands the rule — absolute
      // `context.filename`s resolved by `ESLint#lintFiles` from files that
      // exist on disk, exercising the real npm `eslint` dependency end to end
      // the same way `bc0d8a5`'s own `sourceRoot: '.'` case claimed to (its
      // landed test only simulated the absolute-path shape through `Linter`
      // with a `cwd` option — this is the first case in this file that
      // actually runs `lintFiles` against real files).
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-relative-escape-'));

      try {
        fs.mkdirSync(path.join(dir, 'lib/app/components'), { recursive: true });

        fs.writeFileSync(
          path.join(dir, 'lib/app/components/Button.ts'),
          'import x from "../resources/matches";\n',
        );

        fs.writeFileSync(
          path.join(dir, 'lib/app/components/Card.ts'),
          'import x from "./Button";\n',
        );

        const eslint = new ESLint({
          cwd: dir,
          overrideConfigFile: true,
          overrideConfig: {
            files: ['**/*.ts'],
            plugins: { blueprint: plugin },
            languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
            rules: {
              'blueprint/relative-escape': ['error', { layouts: LAYOUTS, sourceRoot: 'lib/app' }],
            },
          },
        });

        const results = await eslint.lintFiles(['**/*.ts']);

        const byFile = new Map(
          results.map((result) => [
            path.relative(dir, result.filePath),
            result.messages.map((message) => message.messageId),
          ]),
        );

        expect(results).toHaveLength(2);

        expect(byFile.get(path.join('lib', 'app', 'components', 'Button.ts'))).toEqual([
          'leavesFolder',
        ]);

        expect(byFile.get(path.join('lib', 'app', 'components', 'Card.ts'))).toEqual([]);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
