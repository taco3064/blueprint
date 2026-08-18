import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { plugin } from './plugin';

const linter = new Linter({ configType: 'flat' });

const LAYOUTS = { components: 'flat', hooks: 'flat' } as const;

function messageIds(code: string, filename: string, root = 'Combat'): string[] {
  return linter
    .verify(
      code,
      {
        files: ['**'],
        plugins: { blueprint: plugin },
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: {
          'blueprint/relative-escape': ['error', { layouts: LAYOUTS, root }],
        },
      },
      { filename },
    )
    .map((message) => message.messageId ?? '');
}

/** The same call with the module's own `layers: false` carried into the options. */
function unlayeredIds(code: string, filename: string, root = 'Combat'): string[] {
  return linter
    .verify(
      code,
      {
        files: ['**'],
        plugins: { blueprint: plugin },
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: {
          'blueprint/relative-escape': ['error', { layouts: LAYOUTS, root, layers: false }],
        },
      },
      { filename },
    )
    .map((message) => message.messageId ?? '');
}

describe('blueprint/relative-escape · root option, a module root file', () => {
  it('imports anything inside its own module, unconstrained', () => {
    expect(messageIds('import x from "./hooks/useCombat";', 'src/Combat/Combat.tsx'))
      .toEqual([]);

    expect(messageIds('import x from "./components/Fighter";', 'src/Combat/Combat.tsx'))
      .toEqual([]);
  });
});

describe('blueprint/relative-escape · root option, an inner layer', () => {
  it('is caught reaching back to its own module root — the loophole that must stay shut', () => {
    expect(messageIds('import x from "../Combat";', 'src/Combat/hooks/useCombat.ts'))
      .toEqual(['leavesFolder']);
  });

  it('stays inside its own layer freely', () => {
    expect(messageIds('import x from "./useOther";', 'src/Combat/hooks/useCombat.ts'))
      .toEqual([]);
  });

  it('leaves the layer reaching a DIFFERENT declared layer of the same module', () => {
    expect(messageIds('import x from "../components/Fighter";', 'src/Combat/hooks/useCombat.ts'))
      .toEqual(['leavesFolder']);
  });
});

describe('blueprint/relative-escape · root option, another module', () => {
  it('reports leavesModule whatever the relative path points at', () => {
    expect(messageIds('import x from "../../Lobby/Lobby";', 'src/Combat/hooks/useCombat.ts'))
      .toEqual(['leavesModule']);
  });

  it('names the module in the message', () => {
    const message = linter.verify(
      'import x from "../../Lobby/Lobby";',
      {
        files: ['**'],
        plugins: { blueprint: plugin },
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: { 'blueprint/relative-escape': ['error', { layouts: LAYOUTS, root: 'Combat' }] },
      },
      { filename: 'src/Combat/hooks/useCombat.ts' },
    )[0]?.message ?? '';

    expect(message).toContain('leaves module "Combat"');
    expect(message).toContain('"../../Lobby/Lobby"');
  });
});

describe('blueprint/relative-escape · root option, scoping', () => {
  it('declines to judge a file whose segment does not match root — module, not layout', () => {
    // Flat, a file is judged when its FIRST segment is a known layout. Modular, it is
    // judged only when its first segment IS the module the entry was scoped to — the
    // emitted config gives every module its own entry, so `root` and the file's own
    // module must agree.
    expect(messageIds('import x from "../Combat";', 'src/Lobby/hooks/useX.ts', 'Combat'))
      .toEqual([]);
  });

  it('still reports escapesSrc for a target that climbs past the root', () => {
    expect(messageIds('import x from "../../../package.json";', 'src/Combat/hooks/useCombat.ts'))
      .toEqual(['escapesSrc']);
  });
});

describe('blueprint/relative-escape · layers option, a module holding its files directly', () => {
  it('reads a folder that shares a declared layer\'s name as a folder', () => {
    // `layouts` stays the architecture-wide map either way — the layer names are
    // declared once for the whole repo. `layers: false` is this module saying
    // they do not reach inside it, and it is the only difference between the two
    // calls below. Without it the file is told to use the alias instead, and
    // emitLint's same-module ban forbids that alias: no legal route out.
    expect(unlayeredIds('import x from "../hooks";', 'src/Combat/components/Fighter.tsx'))
      .toEqual([]);

    expect(messageIds('import x from "../hooks";', 'src/Combat/components/Fighter.tsx'))
      .toEqual(['leavesFolder']);
  });

  it('reaches past such a folder\'s entry too — one governance scope, at any depth', () => {
    expect(unlayeredIds('import x from "../hooks/clamp";', 'src/Combat/components/Fighter.tsx'))
      .toEqual([]);
  });

  it('still holds the module boundary and the source root around it', () => {
    expect(unlayeredIds('import x from "../../Lobby/Lobby";', 'src/Combat/components/F.tsx'))
      .toEqual(['leavesModule']);

    expect(unlayeredIds('import x from "../../../package.json";', 'src/Combat/components/F.tsx'))
      .toEqual(['escapesSrc']);
  });
});
