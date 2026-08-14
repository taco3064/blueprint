import { RuleTester } from 'eslint';
import type { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';

import { noModuleReexport } from './no-module-reexport';

/**
 * Every spelling that hands another module's surface through this one's.
 *
 * Two of them were found by prototyping rather than by reading, which is the
 * reason this list is exhaustive rather than representative: banning only the
 * spellings a specifier pattern reaches makes every other one a free
 * workaround, and the rule exists precisely because `no-restricted-imports`
 * cannot see a binding.
 */
const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

const options = [{ aliases: ['~app'], modules: ['app', 'GameStage', 'Combat'], module: 'GameStage' }];

const invalid = (code: string) => ({ code, options, errors: [{ messageId: 'passThrough' }] });

describe('blueprint/no-module-reexport', () => {
  it('catches every spelling of a pass-through, and leaves composition alone', () => {
    tester.run('no-module-reexport', noModuleReexport, {
      valid: [
        // The dependency used, not forwarded — what a declared `imports` is for.
        { code: 'import { attack } from "~app/Combat";\nexport const fire = () => attack();', options },
        // A wrapper is explicitly not banned: no static tool can separate a
        // domain abstraction from a deliberate forward, so the guarantee is
        // stated at the width it holds and the message names this non-fix.
        { code: 'import { attack } from "~app/Combat";\nexport function startGame() { return attack(); }', options },
        // This module's own surface, and its own layers.
        { code: 'export { run } from "~app/GameStage/hooks/useRun";', options },
        { code: 'export * from "./local";', options },
        // A relative path that leaves the module is `relative-escape`'s
        // `leaves-module`; reporting it here would make one edit answer twice.
        { code: 'export { attack } from "../../Combat";', options },
        // Not a module at all.
        { code: 'export { render } from "react-dom";', options },
        // A name nobody declared is an undeclared-module edge for
        // `no-restricted-imports`, not a pass-through.
        { code: 'export { x } from "~app/Nowhere";', options },
        // A default that binds no identifier forwards nothing to look up.
        { code: 'import { attack } from "~app/Combat";\nexport default 1;', options },
        { code: 'import { attack } from "~app/Combat";\nexport default function go() { return attack; }', options },
        // A local of this module's own, exported normally.
        { code: 'const own = 1;\nexport { own };', options },
      ],
      invalid: [
        // The two spellings the RFC names.
        invalid('export { attack } from "~app/Combat";'),
        invalid('export * from "~app/Combat";'),
        // The same effect in two statements — no specifier pattern sees this.
        invalid('import { attack } from "~app/Combat";\nexport { attack };'),
        // Renaming is not a bypass, in either direction: the binding is
        // followed, never the name.
        invalid('import { attack as ca } from "~app/Combat";\nexport { ca };'),
        invalid('import { attack } from "~app/Combat";\nexport { attack as go };'),
        // Found by prototyping rather than by reading.
        invalid('import * as combat from "~app/Combat";\nexport { combat };'),
        invalid('import { attack } from "~app/Combat";\nexport default attack;'),
        // A default import forwarded is the same hand-over.
        invalid('import Combat from "~app/Combat";\nexport { Combat };'),
      ],
    });
  });

  // Type-only needs the TS parser — espree cannot parse `export type` at all,
  // so a single tester would have reported this as a fatal parse error rather
  // than as an unenforced ban.
  it('counts type-only in all three of its shapes', () => {
    const ts = new RuleTester({
      languageOptions: {
        parser: tseslint.parser as Linter.Parser,
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    });

    ts.run('no-module-reexport', noModuleReexport, {
      valid: [
        { code: 'import type { CombatState } from "~app/Combat";\nexport const n: CombatState = 1;', options },
      ],
      invalid: [
        // A type surface is a coupling — change Combat's types and the module
        // that forwarded them breaks — and `no-restricted-imports` bans type
        // imports by default, so exempting them here would be the one place
        // type-only slips through.
        invalid('export type { CombatState } from "~app/Combat";'),
        invalid('import type { CombatState } from "~app/Combat";\nexport type { CombatState };'),
        invalid('import { type CombatState } from "~app/Combat";\nexport { type CombatState };'),
      ],
    });
  });

  it('reads the module it was given, not the one it can guess', () => {
    // The entry names the module it governs, so the rule never parses a path
    // to find out — the same reason `relative-escape` is passed its depth.
    tester.run('no-module-reexport', noModuleReexport, {
      valid: [
        { code: 'export { attack } from "~app/Combat";', options: [{ ...options[0], module: 'Combat' }] },
      ],
      invalid: [
        {
          code: 'export { attack } from "~app/GameStage";',
          options: [{ ...options[0], module: 'Combat' }],
          errors: [{ messageId: 'passThrough' }],
        },
      ],
    });
  });

  it('says nothing at all when no module is configured', () => {
    // A flat project never receives this rule; asked anyway, it has no module
    // list to judge against and must not invent one.
    tester.run('no-module-reexport', noModuleReexport, {
      valid: [{ code: 'export { attack } from "~app/Combat";' }],
      invalid: [],
    });
  });
});
