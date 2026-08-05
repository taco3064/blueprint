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

    // Downward, into a nested folder of a FLAT layer. Both cases above stay at the
    // same depth, where the module key collapses to the layer name whatever the
    // layout says — so a `layoutOf` answering nonsense produced the same verdict.
    // This one does not: read as folder-shaped, `layout/Bar` becomes a module and
    // reaching into it is a violation. A flat layer has no inside.
    expect(messageIds('import x from "./layout/Bar";', 'src/components/Button.ts'))
      .toEqual([]);
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

  it('allows a sibling module by its entry', () => {
    expect(
      messageIds('import x from "../markets";', 'src/resources/matches/Row.ts'),
    ).toEqual([]);

    expect(
      messageIds('import x from "../markets/index";', 'src/resources/matches/Row.ts'),
    ).toEqual([]);
  });

  it('flags reaching past a sibling entry', () => {
    expect(
      messageIds(
        'import x from "../../markets/Board";',
        'src/resources/matches/components/Row.ts',
      ),
    ).toEqual(['reachesInside']);
  });

  it('flags a relative that leaves the layer entirely', () => {
    expect(
      messageIds('import x from "../../services/api";', 'src/resources/matches/Row.ts'),
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

describe('blueprint/relative-escape · what the rule declines to judge', () => {
  const texts = (code: string, filename: string): string[] =>
    linter
      .verify(
        code,
        {
          files: ['**'],
          plugins: { blueprint: plugin },
          languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
          rules: { 'blueprint/relative-escape': ['error', { layouts: LAYOUTS }] },
        },
        { filename },
      )
      .map((message) => message.message);

  it('stays out of files that sit under no src/ directory at all', () => {
    // Without the `src` anchor the entire path becomes layer segments, and any
    // top-level folder that happens to share a layer name starts being linted
    // as that layer.
    expect(messageIds('import x from "../resources/matches";', 'components/Button.ts'))
      .toEqual([]);
  });

  it('anchors on src wherever it sits, not at a fixed depth', () => {
    // `src` as the second segment is the ordinary monorepo shape, and the
    // segments after it must still be read as layers.
    expect(messageIds('import x from "../resources/matches";', 'repo/src/components/Button.ts'))
      .toEqual(['leavesModule']);

    expect(messageIds('import x from "./Card";', 'repo/src/components/Button.ts')).toEqual([]);
  });

  it('leaves every non-relative specifier alone', () => {
    // Alias imports are what this rule tells people to use instead; running
    // them through the relative resolver would invent violations in the one
    // form the fix recommends.
    expect(messageIds('import x from "~app/resources/matches";', 'src/components/Button.ts'))
      .toEqual([]);

    expect(messageIds('import x from "node:path";', 'src/components/Button.ts')).toEqual([]);
  });

  it('leaves a bare specifier alone even where the resolver would call it a reach', () => {
    // Resolved as a path, a package specifier lands under the importer's own
    // directory and deep enough that the folder-module verdict reads it as
    // reaching past an entry. The relative guard is the only thing keeping
    // every package import in a folder-module layer from being reported.
    expect(messageIds('import x from "lodash/fp/curry";', 'src/resources/index.ts')).toEqual([]);
  });

  it('tolerates a doubled separator in the filename', () => {
    // An empty path segment would land where the layer name goes, and the rule
    // would then decline to judge the file at all.
    expect(messageIds('import x from "../resources/matches";', 'src//components/Button.ts'))
      .toEqual(['leavesModule']);
  });

  it('leaves a dynamic import whose specifier is not a string', () => {
    // `import(123)` parses fine. Handing a number to a resolver that calls
    // `.startsWith` throws inside the adopter's lint run instead of reporting.
    expect(messageIds('const p = import(123);', 'src/components/Button.ts')).toEqual([]);
  });

  it('names the specifier, and the sibling entry, in what it reports', () => {
    // The data block is the whole difference between an actionable message and
    // one that renders `{{specifier}}` literally.
    expect(texts('import x from "../resources/matches";', 'src/components/Button.ts')[0])
      .toContain('"../resources/matches"');

    const inside = texts(
      'import x from "../../markets/Board";',
      'src/resources/matches/components/Row.ts',
    )[0];

    expect(inside).toContain('"../../markets/Board"');
    expect(inside).toContain('"index"');
  });
});

describe('blueprint/relative-escape · what each verdict tells the reader', () => {
  const report = (code: string, filename: string) =>
    linter.verify(
      code,
      {
        files: ['**'],
        plugins: { blueprint: plugin },
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: { 'blueprint/relative-escape': ['error', { layouts: LAYOUTS }] },
      },
      { filename },
    )[0];

  // The three messageIds were pinned; their texts were not, so all three could
  // go empty together and every existing assertion would still pass. Each one
  // has to name the offending specifier back (the file may hold many relative
  // imports) and give the move for ITS verdict — the moves differ, and handing
  // the reader the wrong one sends them to a path that is also illegal.
  it('quotes the specifier and offers the alias when the import escapes src/', () => {
    const message = report('import x from "../../package.json";', 'src/components/Button.ts')
      ?.message ?? '';

    expect(message).toContain('"../../package.json"');
    expect(message).toContain('escapes src/');
    expect(message).toContain('use the project alias');
    expect(message).not.toContain('{{');
  });

  it('offers the alias or a lower layer when the import leaves the layer', () => {
    const message = report('import x from "../resources/matches";', 'src/components/Button.ts')
      ?.message ?? '';

    expect(message).toContain('"../resources/matches"');
    expect(message).toContain('leaves this layer');
    expect(message).toContain('use the alias, or extract shared code to a lower layer');
  });

  it('names the entry to import instead when the import reaches inside', () => {
    // This one interpolates a second value — the target layer's own entry name.
    // Losing it leaves "import "" instead", which is not a path anyone can type.
    const message = report(
      'import x from "../matches/parts/Cell";',
      'src/resources/markets/Row.ts',
    )?.message ?? '';

    expect(message).toContain('"../matches/parts/Cell"');
    expect(message).toContain('reaches past a sibling\'s entry');
    expect(message).toContain('import "index" instead');
    expect(message).not.toContain('{{');
  });

  it('points at the import that broke the rule, not at the first one', () => {
    // A file's imports sit in a block. Reporting the file, or the block's first
    // line, leaves the author comparing every specifier against the rule by hand.
    const out = report([
      'import a from "./Card";',
      'import b from "./Panel";',
      'import c from "../resources/matches";',
    ].join('\n'), 'src/components/Button.ts');

    expect(out?.line).toBe(3);
  });
});

describe('blueprint/relative-escape · a layer the options never mention', () => {
  it('declines to judge a file whose own layer is not in layouts', () => {
    // The rule checks a file only when its own layer appears in `layouts` — an
    // unmentioned folder is outside the contract the rule was handed, not a flat
    // layer by default. Judging it anyway applies a shape nobody declared, and
    // the emitted config passes `layouts` for exactly the declared layers.
    expect(messageIds('import x from "../B/B.ts";', 'src/unlisted/A/A.ts')).toEqual([]);

    // A declared folder layer still gets the folder answer — this is a boundary
    // on what the rule speaks about, not a blanket exemption.
    expect(messageIds('import x from "../markets/parts/Cell";', 'src/resources/matches/Row.ts'))
      .toEqual(['reachesInside']);
  });
});
