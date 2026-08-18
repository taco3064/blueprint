import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { defineBlueprint } from '../../config';
import { emitLint } from './lint';

/**
 * The real-ESLint proof for `architecture.modules`, at this stage's own narrow
 * level — AC2, AC3, AC11, AC12, AC13a. `src/conformance/` re-proves the same
 * claims again through the fuller fixture-driven suite (stage 4's job); this
 * file is `emitLint`'s own direct instrument, the same convention
 * `lint.gates.test.ts` / `lint.plugins.test.ts` already use.
 *
 * Order is the fixture: Shell (0) < Combat (1) < Lobby (2).
 * - Shell ↔ Combat is the DECLARED-ORDER edge — neither module narrows
 *   allowedImporters, so Shell (earlier) may reach Combat (later) by the
 *   default rule alone, and the reverse (Combat → Shell, upstream) is not.
 * - Lobby is the NARROWED edge — its own allowedImporters names only Combat,
 *   selfOnly, so Combat may depend on it but not re-export it, and Shell
 *   (otherwise entitled by order) is excluded by the narrowing.
 * - Combat is layered (hooks / components); Lobby holds its files directly
 *   (`layers: false`) — the fixture proves entry-only enforcement against
 *   both target shapes.
 */
const blueprint = defineBlueprint({
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'hooks', does: 'state' },
      { name: 'components', does: 'ui' },
    ],
    modules: [
      { name: 'Shell', does: 'app chrome' },
      { name: 'Combat', does: 'the fight loop', owns: [{ global: 'requestAnimationFrame' }] },
      {
        name: 'Lobby',
        does: 'matchmaking',
        layers: false,
        allowedImporters: [{ module: 'Combat', selfOnly: true, description: 'combat only' }],
      },
    ],
  },
});

const config = [
  { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
  ...emitLint(blueprint),
];

const linter = new Linter({ configType: 'flat' });

/** Restricted-rule ids reported for `code` when linted as `filename`. */
function restricted(code: string, filename: string): string[] {
  return linter
    .verify(code, config, { filename })
    .map((message) => message.ruleId)
    .filter((id): id is string => id != null && id.startsWith('no-restricted-'));
}

/** Every rule id reported, unfiltered — for `blueprint/relative-escape` and message checks. */
function verify(code: string, filename: string) {
  return linter.verify(code, config, { filename });
}

const SHELL_ROOT = 'src/Shell/Shell.tsx';
const COMBAT_ROOT = 'src/Combat/Combat.tsx';
const COMBAT_HOOKS = 'src/Combat/hooks/useCombat.ts';
const COMBAT_COMPONENTS = 'src/Combat/components/Fighter.tsx';

describe('AC2 · declared-order edge (Shell ↔ Combat, no allowedImporters needed)', () => {
  it('passes a legal import: Shell (earlier) reaches Combat (later) at its entry', () => {
    expect(restricted('import { Combat } from "~app/Combat";', SHELL_ROOT)).toEqual([]);
  });

  it('AC3 · catches the reverse: Combat reaching Shell is upstream, not permitted', () => {
    expect(restricted('import { Shell } from "~app/Shell";', COMBAT_ROOT))
      .toContain('no-restricted-imports');
  });
});

describe('AC2 · narrowed edge (Lobby restricts allowedImporters to Combat only)', () => {
  it('passes a legal import: Combat, the one module Lobby names', () => {
    expect(restricted('import { Lobby } from "~app/Lobby";', COMBAT_ROOT)).toEqual([]);
  });

  it('AC3 · catches Shell, which order alone would allow but the narrowing excludes', () => {
    expect(restricted('import { Lobby } from "~app/Lobby";', SHELL_ROOT))
      .toContain('no-restricted-imports');
  });
});

describe('AC2 · entry-only enforcement, both target shapes', () => {
  it('a layered module (Combat): bare entry legal, reaching a layer past it caught', () => {
    expect(restricted('import { Combat } from "~app/Combat";', SHELL_ROOT)).toEqual([]);

    expect(restricted('import { useCombat } from "~app/Combat/hooks/useCombat";', SHELL_ROOT))
      .toContain('no-restricted-imports');
  });

  it('a layers: false module (Lobby): bare entry legal, reaching past it caught', () => {
    expect(restricted('import { Lobby } from "~app/Lobby";', COMBAT_ROOT)).toEqual([]);

    expect(restricted('import { Matchmaker } from "~app/Lobby/Matchmaker";', COMBAT_ROOT))
      .toContain('no-restricted-imports');
  });
});

describe('AC2 · root ↔ inner-layer direction, both routes', () => {
  it('a module root file relatively importing its own inner layer passes', () => {
    const ids = verify('import { useCombat } from "./hooks/useCombat";', COMBAT_ROOT)
      .map((m) => m.ruleId);

    expect(ids).not.toContain('blueprint/relative-escape');
  });

  it('an inner layer relatively importing its own module root is caught (leaves-layer)', () => {
    const ids = verify('import { Combat } from "../Combat";', COMBAT_HOOKS).map((m) => m.ruleId);

    expect(ids).toContain('blueprint/relative-escape');
  });
});

describe('AC2 · the paired alias case, both arms, in one fixture', () => {
  it('fails: reaching back to the module root via the alias, from inside the module', () => {
    expect(restricted('import { Combat } from "~app/Combat";', COMBAT_COMPONENTS))
      .toContain('no-restricted-imports');
  });

  it('passes: the intra-module cross-layer alias import stays legal', () => {
    expect(restricted('import { useCombat } from "~app/Combat/hooks";', COMBAT_COMPONENTS))
      .toEqual([]);
  });
});

describe('AC11 · module-level owns cascades to every layer inside it, and bars elsewhere', () => {
  it('an inner layer of the OWNING module may use the primitive', () => {
    expect(restricted('const id = requestAnimationFrame(() => {});', COMBAT_HOOKS)).toEqual([]);
  });

  it('a layer inside a DIFFERENT module is barred, and the message names the owning module', () => {
    const results = verify('const id = requestAnimationFrame(() => {});', SHELL_ROOT);
    const message = results[0]?.message ?? '';

    expect(message).toContain('requestAnimationFrame');
    expect(message).toContain('module "Combat"');
  });
});

describe('AC12 · module-level selfOnly prevents re-export', () => {
  it('the allowed module may use the selfOnly target internally', () => {
    expect(restricted('import { Lobby } from "~app/Lobby";', COMBAT_ROOT)).toEqual([]);
  });

  it('re-exporting the selfOnly target onward is caught', () => {
    expect(restricted('export { Lobby } from "~app/Lobby";', COMBAT_ROOT))
      .toContain('no-restricted-syntax');
  });
});

describe('AC13a · a layers: false module — file-group and cross-module entry-only ban, '
  + 'checked against the emitted config directly', () => {
  const entries = emitLint(blueprint);

  it('carries an entry scoped to the module\'s own files', () => {
    const hasLobbyFiles = entries.some((entry) =>
      entry.files?.some((glob) => glob.includes('Lobby')));

    expect(hasLobbyFiles).toBe(true);
  });

  it('bans the entry-only reach for the one module allowed to import it (Combat)', () => {
    const hasEntryOnlyBan = entries.some((entry) => {
      const patterns = (entry.rules?.['no-restricted-imports'] as unknown[] | undefined)?.[1] as
        | { patterns?: { group: string[] }[] }
        | undefined;

      return patterns?.patterns?.some((p) => p.group.includes('~app/Lobby/**'));
    });

    expect(hasEntryOnlyBan).toBe(true);
  });

  it('carries the module\'s own layers: false into its relative-escape options', () => {
    // The rule reads `layouts` as the declared layer names, and they are
    // architecture-wide — so without this the module is judged to have layers it
    // declared it has not. Asserted as the whole option object, per module, so a
    // key emitted on the wrong one is a red rather than a silent widening.
    const options = new Map(entries.flatMap((entry) => {
      const rule = entry.rules?.['blueprint/relative-escape'] as
        | [string, { root?: string }]
        | undefined;

      return rule ? [[rule[1].root ?? null, rule[1]]] : [];
    }));

    const shape = {
      layouts: { hooks: 'flat', components: 'flat' },
      entries: { hooks: 'index', components: 'index' },
    };

    expect(options.get('Lobby')).toEqual({ ...shape, root: 'Lobby', layers: false });
    expect(options.get('Combat')).toEqual({ ...shape, root: 'Combat' });
    expect(options.get('Shell')).toEqual({ ...shape, root: 'Shell' });
  });

  it('bans BOTH spellings for a module that may not import it at all (Shell)', () => {
    const hasWholesaleBan = entries.some((entry) => {
      const patterns = (entry.rules?.['no-restricted-imports'] as unknown[] | undefined)?.[1] as
        | { patterns?: { group: string[] }[] }
        | undefined;

      return patterns?.patterns?.some(
        (p) => p.group.includes('~app/Lobby') && p.group.includes('~app/Lobby/**'),
      );
    });

    expect(hasWholesaleBan).toBe(true);
  });
});
