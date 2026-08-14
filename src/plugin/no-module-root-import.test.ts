import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';

import { noModuleRootImport } from './no-module-root-import';

/**
 * The spellings `no-restricted-imports` structurally cannot reach.
 *
 * A group is gitignore-matched, so banning the module folder takes its own
 * layers with it; a `paths` entry matches exactly, so it carries the two names
 * a config knows and never a root component's filename. Everything below is the
 * set left over, which is why this rule exists at all.
 */
const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

const options = [{
  aliases: ['~app'],
  layers: ['components', 'hooks'],
  module: 'Fighter',
  depth: 1,
}];

const invalid = (code: string) => ({ code, options, errors: [{ messageId: 'reachesRoot' }] });

describe('blueprint/no-module-root-import', () => {
  it('reddens every spelling of the module root, and leaves the layers alone', () => {
    tester.run('no-module-root-import', noModuleRootImport, {
      valid: [
        // A sibling unit's entry, and a unit inside another layer — the inner
        // flow's business, governed by their own groups with their own messages.
        { code: 'import { y } from "~app/Fighter/hooks/useY";', options },
        { code: 'import { h } from "~app/Fighter/components/Hud";', options },
        // Cross-module, which is #182's rule and a different remedy.
        { code: 'import { a } from "~app/Combat";', options },
        { code: 'import { a } from "~app/Combat/Combat";', options },
        // A relative climb is `relative-escape`'s `reaches-root`; reporting it
        // here would make one edit answer to two rules.
        { code: 'import { f } from "../../../Fighter";', options },
        { code: 'import { f } from "./local";', options },
        // Not the alias at all.
        { code: 'import { render } from "react-dom";', options },
      ],
      invalid: [
        // The two `paths` already covers, which must stay red.
        invalid('import { f } from "~app/Fighter";'),
        invalid('import { f } from "~app/Fighter/index";'),
        // The case this rule adds: the root by its component filename, which is
        // what the RFC says a single-component module's root is CALLED.
        invalid('import { f } from "~app/Fighter/Fighter";'),
        invalid('import { f } from "~app/Fighter/Fighter.tsx";'),
        // Any other direct child of the module folder is the root too.
        invalid('import { t } from "~app/Fighter/types";'),
        invalid('import { s } from "~app/Fighter/Fighter.module.css";'),
        // Every statement shape that carries a specifier.
        invalid('export { f } from "~app/Fighter/Fighter";'),
        invalid('export * from "~app/Fighter/Fighter";'),
        invalid('const f = await import("~app/Fighter/Fighter");'),
      ],
    });
  });

  it('reads every alias base it was given', () => {
    const twoBases = [{ ...options[0], aliases: ['~app', '~root/src'] }];

    tester.run('no-module-root-import', noModuleRootImport, {
      valid: [{ code: 'import { y } from "~root/src/Fighter/hooks/useY";', options: twoBases }],
      invalid: [{
        code: 'import { f } from "~root/src/Fighter/Fighter";',
        options: twoBases,
        errors: [{ messageId: 'reachesRoot' }],
      }],
    });
  });

  it('judges the module it was given, not one it can guess', () => {
    // Passed rather than parsed out of the filename, the same reason
    // `relative-escape` is handed its depth: the entry knows which module it
    // governs, and a path read from disk is one more thing to get wrong.
    tester.run('no-module-root-import', noModuleRootImport, {
      valid: [{ code: 'import { f } from "~app/Fighter/Fighter";', options: [{ ...options[0], module: 'Combat' }] }],
      invalid: [{
        code: 'import { c } from "~app/Combat/Combat";',
        options: [{ ...options[0], module: 'Combat' }],
        errors: [{ messageId: 'reachesRoot' }],
      }],
    });
  });

  it('says nothing at a flat depth, where there is no root to reach', () => {
    tester.run('no-module-root-import', noModuleRootImport, {
      valid: [{
        code: 'import { h } from "~app/hooks/useX";',
        options: [{ aliases: ['~app'], layers: ['hooks'], module: 'hooks', depth: 0 }],
      }],
      invalid: [],
    });
  });

  it('says nothing at all when no options are given', () => {
    // A flat project never receives this rule; asked anyway it has no module to
    // be the root of and must not invent one.
    tester.run('no-module-root-import', noModuleRootImport, {
      valid: [{ code: 'import { f } from "~app/Fighter/Fighter";' }],
      invalid: [],
    });
  });

  it('refuses an option block it cannot trust', () => {
    // The schema runs in repos that never installed the plugin — it is what
    // turns a typo in a hand-merged config into an error rather than a rule
    // quietly governing nothing.
    const refuses = (opts: unknown) =>
      expect(() => tester.run('no-module-root-import', noModuleRootImport, {
        valid: [{ code: 'const x = 1;', options: [opts] }],
        invalid: [],
      })).toThrow();

    refuses('not an object');
    refuses({ aliases: '~app' });
    refuses({ layers: [1] });
    refuses({ module: 1 });
    refuses({ depth: -1 });
    refuses({ depth: 1, typo: true });
  });
});
