import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { plugin } from './plugin';

const linter = new Linter({ configType: 'flat' });

const LAYOUTS = {
  resources: 'folder',
  components: 'flat',
} as const;

function messageIds(
  code: string,
  filename: string,
  layouts: Record<string, 'folder' | 'flat'> | null = LAYOUTS,
): string[] {
  return linter
    .verify(
      code,
      {
        files: ['**'],
        plugins: { blueprint: plugin },
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: {
          'blueprint/relative-escape': layouts ? ['error', { layouts }] : 'error',
        },
      },
      { filename },
    )
    .map((message) => message.messageId ?? '');
}

describe('blueprint/relative-escape · flat layer', () => {
  it('allows relatives that stay inside the layer', () => {
    expect(messageIds('import x from "./Card";', 'src/components/Button.ts')).toEqual([]);

    expect(
      messageIds('import x from "../IdleGuard";', 'src/components/layout/Bar.ts'),
    ).toEqual([]);
  });

  it('flags relatives that cross into another layer', () => {
    expect(messageIds('import x from "../resources/matches";', 'src/components/Button.ts'))
      .toEqual(['leavesModule']);
  });

  it('flags relatives that climb above src/', () => {
    expect(messageIds('import x from "../../package.json";', 'src/components/Button.ts'))
      .toEqual(['escapesSrc']);
  });
});

describe('blueprint/relative-escape · folder layer', () => {
  it('allows intra-module relatives at any depth', () => {
    expect(
      messageIds('import x from "../MatchesList";', 'src/resources/matches/components/Row.ts'),
    ).toEqual([]);
  });

  it('flags cross-module relatives, entry or internals alike', () => {
    expect(
      messageIds('import x from "../markets";', 'src/resources/matches/Row.ts'),
    ).toEqual(['leavesModule']);

    expect(
      messageIds(
        'import x from "../../markets/Board";',
        'src/resources/matches/components/Row.ts',
      ),
    ).toEqual(['leavesModule']);
  });
});

describe('blueprint/relative-escape · reference kinds', () => {
  it('checks re-exports and dynamic imports too', () => {
    expect(messageIds('export { x } from "../resources/matches";', 'src/components/Button.ts'))
      .toEqual(['leavesModule']);

    expect(messageIds('export * from "../resources/matches";', 'src/components/Button.ts'))
      .toEqual(['leavesModule']);

    expect(messageIds('const x = await import("../resources/matches");', 'src/components/Button.ts'))
      .toEqual(['leavesModule']);
  });

  it('ignores non-relative and non-literal specifiers, and sourceless exports', () => {
    expect(messageIds('import x from "~app/resources/matches";', 'src/components/Button.ts'))
      .toEqual([]);

    expect(messageIds('const x = await import(dynamic);', 'src/components/Button.ts')).toEqual([]);
    expect(messageIds('export const y = 1;', 'src/components/Button.ts')).toEqual([]);
  });
});

describe('blueprint/relative-escape · scoping', () => {
  it('skips files outside src/ or outside a declared layer, and bare src files', () => {
    expect(messageIds('import x from "../anything";', 'scripts/build.ts')).toEqual([]);
    expect(messageIds('import x from "../components/Button";', 'src/utils/helper.ts')).toEqual([]);
    expect(messageIds('import x from "./routes";', 'src')).toEqual([]);
  });

  it('handles absolute paths (resolves segments after the last src/)', () => {
    expect(
      messageIds(
        'import x from "../resources/matches";',
        `${process.cwd()}/src/components/Button.ts`,
      ),
    ).toEqual(['leavesModule']);
  });

  it('defaults to no layouts when options are omitted (rule inert)', () => {
    expect(messageIds('import x from "../resources/x";', 'src/components/Button.ts', null))
      .toEqual([]);
  });

  it('treats targets outside any declared layer as flat (still an escape)', () => {
    expect(
      messageIds('import x from "../../legacy/utils/x";', 'src/components/layout/Bar.ts'),
    ).toEqual(['leavesModule']);
  });
});
