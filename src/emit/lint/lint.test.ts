import stylisticPlugin from '@stylistic/eslint-plugin';
import { Linter } from 'eslint';
import importsPlugin from 'eslint-plugin-import-x';
import { describe, expect, it } from 'vitest';

import { defineBlueprint } from '../../config';
import { emitLint } from './lint';
import type { LintConfigEntry } from './types';

const blueprint = defineBlueprint({
  framework: 'auto',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'components', does: 'UI' },
      { name: 'hooks', does: 'state', owns: [{ package: 'react', imports: ['useContext'] }] },
      {
        name: 'services',
        does: 'net',
        owns: ['axios', { global: 'fetch' }],
        allowedImporters: [{ layer: 'components', selfOnly: true }, 'hooks'],
      },
    ],
    folder: { layout: 'folder', entry: 'index', private: ['hooks', 'styles', 'types'] },
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

const COMPONENT = 'src/components/Button/Button.ts';
const SERVICE = 'src/services/api/api.ts';

describe('emitLint · dependency flow', () => {
  it('allows importing a downstream folder through its entry', () => {
    expect(restricted('import { useX } from "~app/hooks/useX";', COMPONENT)).toEqual([]);
  });

  it('bans importing an upstream layer', () => {
    expect(restricted('import { Button } from "~app/components/Button";', SERVICE)).toContain(
      'no-restricted-imports',
    );
  });

  it('bans importing the same layer via the alias', () => {
    expect(restricted('import { Card } from "~app/components/Card";', COMPONENT)).toContain(
      'no-restricted-imports',
    );
  });

  it('bans an upper-level relative import through the escape rule', () => {
    // Depth-aware: lives in blueprint/relative-escape, not a literal pattern.
    const ids = linter
      .verify('import { useX } from "../hooks/useX";', config, { filename: COMPONENT })
      .map((message) => message.ruleId);

    expect(ids).toContain('blueprint/relative-escape');
  });

  it('allows a relative import that stays inside the folder', () => {
    const ids = linter
      .verify('import { helper } from "./helper";', config, { filename: COMPONENT })
      .map((message) => message.ruleId);

    expect(ids).not.toContain('blueprint/relative-escape');
  });
});

describe('emitLint · folder boundaries', () => {
  it('bans reaching inside another folder (deep import)', () => {
    expect(restricted('import x from "~app/hooks/useX/impl";', COMPONENT)).toContain(
      'no-restricted-imports',
    );
  });

  it('does not catch undeclared folders in lint — deferred to inspect (S6)', () => {
    // ESLint group negation cannot express closed-world; inspect handles it.
    expect(restricted('import x from "~app/utils/helper";', COMPONENT)).toEqual([]);
  });
});

describe('emitLint · package ownership', () => {
  it('bans a package in a layer that does not own it', () => {
    expect(restricted('import axios from "axios";', COMPONENT)).toContain('no-restricted-imports');
  });

  it('allows a package in its owning layer', () => {
    expect(restricted('import axios from "axios";', SERVICE)).toEqual([]);
  });

  it('bans only the named import that another layer owns', () => {
    expect(restricted('import { useContext } from "react";', COMPONENT)).toContain(
      'no-restricted-imports',
    );

    expect(restricted('import { useState } from "react";', COMPONENT)).toEqual([]);
  });
});

describe('emitLint · global ownership', () => {
  it('bans a global in a layer that does not own it', () => {
    expect(restricted('const r = fetch("/x");', COMPONENT)).toContain('no-restricted-globals');
  });

  it('allows a global in its owning layer', () => {
    expect(restricted('const r = fetch("/x");', SERVICE)).toEqual([]);
  });
});

describe('emitLint · selfOnly re-export', () => {
  it('bans re-exporting from a selfOnly target', () => {
    expect(restricted('export { api } from "~app/services/api";', COMPONENT)).toContain(
      'no-restricted-syntax',
    );
  });

  it('still allows importing (not re-exporting) the selfOnly target', () => {
    expect(restricted('import { api } from "~app/services/api";', COMPONENT)).toEqual([]);
  });
});

describe('emitLint · additionalAliases with an offset target (field #29)', () => {
  // '~root': '.' — the field repo's shape: layers live under src/, the
  // alias points at the repo root. Patterns composed as `~root/<layer>`
  // banned paths no real import ever used, so the whole ~root leg was a
  // silent no-op while the playbook claimed it joined every ban.
  const rooted = defineBlueprint({
    framework: 'auto',
    architecture: {
      alias: '~app',
      additionalAliases: { '~root': '.', '~shared': './src/shared' },
      layers: [
        { name: 'views', does: 'pages' },
        {
          name: 'services',
          does: 'net',
          allowedImporters: [{ layer: 'views', selfOnly: true }],
        },
      ],
    },
  });

  const rootedConfig = [
    { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
    ...emitLint(rooted),
  ];

  const hits = (code: string, filename: string) =>
    linter
      .verify(code, rootedConfig, { filename })
      .map((message) => message.ruleId)
      .filter((id): id is string => id != null && id.startsWith('no-restricted-'));

  it('bans the real ~root/src/… path — flow and selfOnly alike', () => {
    expect(hits('import { V } from "~root/src/views/V";', 'src/services/api.ts'))
      .toContain('no-restricted-imports');

    expect(hits('export { api } from "~root/src/services/api";', 'src/views/Home.ts'))
      .toContain('no-restricted-syntax');
  });

  it('a subfolder alias has no layer surface — no bans through it', () => {
    expect(hits('import { d } from "~shared/date";', 'src/views/Home.ts')).toEqual([]);
  });
});

describe('emitLint · shape', () => {
  it('emits one config entry per layer plus the escape entry, all with files globs', () => {
    const emitted = emitLint(blueprint);

    expect(emitted).toHaveLength(4); // 3 layers + blueprint/relative-escape
    expect(emitted.every((entry) => Array.isArray(entry.files))).toBe(true);

    const escape = emitted.find((entry) => entry.rules?.['blueprint/relative-escape']);

    expect(escape?.rules?.['blueprint/relative-escape']).toEqual([
      'error',
      {
        layouts: { components: 'folder', hooks: 'folder', services: 'folder' },
        entries: { components: 'index', hooks: 'index', services: 'index' },
      },
    ]);

    expect(escape?.plugins?.blueprint).toBeDefined();
  });

  it('honors emit.lint.severity', () => {
    const warned = emitLint({ ...blueprint, emit: { lint: { severity: 'warn' } } });
    const rule = warned[0].rules?.['no-restricted-imports'] as [string];

    expect(rule[0]).toBe('warn');
  });

  it('emits no gate entries when the blueprint has no rules record', () => {
    expect(emitLint(blueprint).some((entry) => entry.rules?.['max-lines'])).toBe(false);
  });

  it('emits a leading ignore entry and splits a layer on exempt files', () => {
    const bp = defineBlueprint({
      framework: 'auto',
      architecture: {
        alias: '~app',
        layers: [
          { name: 'components', does: '' },
          { name: 'services', does: '', owns: [{ package: 'axios', exempt: ['**/*.gen.ts'] }] },
        ],
        layerFilesIgnore: ['**/*.d.ts'],
        folder: { layout: 'folder', entry: 'index', private: [] },
      },
    });

    const emitted = emitLint(bp);

    expect(emitted[0]).toEqual({ ignores: ['**/*.d.ts'] });

    const componentEntries = emitted.filter(
      (entry) =>
        entry.rules?.['no-restricted-imports']
        && entry.files?.some((file) => file.includes('components')),
    );

    expect(componentEntries).toHaveLength(2);
    expect(componentEntries.some((entry) => entry.ignores?.includes('**/*.gen.ts'))).toBe(true);
  });
});

describe('emitLint · per-layer folder layout', () => {
  const mixed = defineBlueprint({
    framework: 'auto',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'pages', does: 'routes' },
        { name: 'resources', does: 'features', folder: { layout: 'folder' } },
        { name: 'services', does: 'net' },
      ],
      folder: { layout: 'flat', entry: 'index', private: [] },
    },
  });

  const cfg = [
    { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
    ...emitLint(mixed),
  ];

  const ids = (code: string, filename: string) =>
    linter.verify(code, cfg, { filename }).map((message) => message.ruleId);

  it('bans deep imports into the folder-layout layer, entry imports stay legal', () => {
    expect(ids('import x from "~app/resources/matches/impl";', 'src/pages/Home.ts'))
      .toContain('no-restricted-imports');

    expect(ids('import x from "~app/resources/matches";', 'src/pages/Home.ts'))
      .not.toContain('no-restricted-imports');
  });

  it('does not ban deep paths into flat-layout layers', () => {
    expect(ids('import x from "~app/services/api/client";', 'src/pages/Home.ts'))
      .not.toContain('no-restricted-imports');
  });

  it('mirrors inspect: intra-folder relatives pass, cross-folder relatives fail', () => {
    // Inside a folder-layout layer, `../` stays within the folder.
    expect(ids('import x from "../MatchesList";', 'src/resources/matches/components/Row.ts'))
      .not.toContain('blueprint/relative-escape');

    // Crossing into a sibling folder leaves it.
    expect(ids('import x from "../../markets/Board";', 'src/resources/matches/components/Row.ts'))
      .toContain('blueprint/relative-escape');

    // In the flat layer, relatives are free within the layer…
    expect(ids('import x from "./Nav";', 'src/pages/Home.ts'))
      .not.toContain('blueprint/relative-escape');

    // …but crossing layers relatively must use the alias.
    expect(ids('import x from "../services/api";', 'src/pages/Home.ts'))
      .toContain('blueprint/relative-escape');
  });
});

describe('emitLint · what an exempted package splits into', () => {
  const mixed = defineBlueprint({
    framework: 'auto',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'components', does: '' },
        {
          name: 'services',
          does: '',
          // One owned package excuses some files, the other excuses none — the
          // pair is what makes the split observable at all.
          owns: [{ package: 'axios', exempt: ['**/*.gen.ts', ''] }, { package: 'lodash' }],
        },
      ],
      folder: { layout: 'folder', entry: 'index', private: [] },
    },
  });

  const banned = (entry: LintConfigEntry) =>
    ((entry.rules?.['no-restricted-imports'] as [unknown, { paths?: { name: string }[] }])[1]
      .paths ?? []).map((path) => path.name);

  it('bans only the unexcused packages on the entry that covers every file', () => {
    const entries = emitLint(mixed).filter(
      (entry) =>
        entry.rules?.['no-restricted-imports'] && entry.files?.some((
          f,
        ) => f.includes('components')),
    );

    expect(entries).toHaveLength(2);

    const wide = entries.find((entry) => !entry.ignores?.includes('**/*.gen.ts'));
    const narrow = entries.find((entry) => entry.ignores?.includes('**/*.gen.ts'));

    // The wide entry reaches the exempted files too, so it may only carry the
    // bans that hold everywhere. Carrying `axios` there bans it in the very
    // files the author excused; carrying only `axios` inverts the split and
    // leaves `lodash` unbanned in every file.
    expect(banned(wide as LintConfigEntry)).toEqual(['lodash']);
    expect(banned(narrow as LintConfigEntry)).toEqual(['axios', 'lodash']);
  });

  it('drops an empty exempt glob instead of handing it to ignores', () => {
    const narrow = emitLint(mixed).find((entry) => entry.ignores?.includes('**/*.gen.ts'));

    // `ignores: ['']` is not a glob eslint can use, and it rides in the same
    // list as the test exemptions this entry depends on.
    expect(narrow?.ignores).not.toContain('');
  });
});

describe('emitLint · which layers become deep-import targets', () => {
  it('names the other folder layers, never the layer itself', () => {
    const entry = emitLint(blueprint).find(
      (item) =>
        item.rules?.['no-restricted-imports'] && item.files?.some((f) => f.includes('components')),
    );

    const groups = (
      entry?.rules?.['no-restricted-imports'] as [unknown, { patterns: { group: string[] }[] }]
    )[1].patterns.flatMap((pattern) => pattern.group);

    expect(groups).toContain('~app/hooks/*/**');
    expect(groups).toContain('~app/services/*/**');

    // The layer's own folders are already banned wholesale by the same-layer
    // group, and no-restricted-imports reports once per matched group — so
    // naming itself here double-reports every same-layer deep import.
    expect(groups).not.toContain('~app/components/*/**');
  });

  it('adds no fixture group unless fixtureImports is declared', () => {
    const patterns = (
      emitLint(blueprint).find(
        (item) =>
          item.rules?.['no-restricted-imports']
          && item.files?.some((f) => f.includes('components')),
      )?.rules?.['no-restricted-imports'] as [unknown, { patterns: { message?: string }[] }]
    )[1].patterns;

    // The fixture ban rides the structural rule, so an unasked-for one is a
    // production ban on a folder the repo may legitimately import from.
    expect(patterns.some((pattern) => pattern.message?.includes('must not import fixtures')))
      .toBe(false);
  });
});

describe('emitLint · registering only the plugins an entry needs', () => {
  it('keeps the stylistic and import-x registrations apart', () => {
    const options = { stylistic: stylisticPlugin, imports: importsPlugin };

    const importOnly = emitLint(
      defineBlueprint({ ...blueprint, rules: { importBlock: 'error' } }),
      options,
    ).find((entry) => entry.rules?.['import-x/no-duplicates']);

    // A plugin registered but unused is not harmless: two entries registering
    // the same key with different objects is a flat-config error, and the
    // adopting repo's own registration is exactly what would collide.
    expect(importOnly?.plugins?.['import-x']).toBe(importsPlugin);
    expect(importOnly?.plugins).not.toHaveProperty('@stylistic');

    const styleOnly = emitLint(
      defineBlueprint({ ...blueprint, rules: { statementPadding: 'error' } }),
      options,
    ).find((entry) => entry.rules?.['@stylistic/padding-line-between-statements']);

    expect(styleOnly?.plugins?.['@stylistic']).toBe(stylisticPlugin);
    expect(styleOnly?.plugins).not.toHaveProperty('import-x');
  });

  it('registers the TypeScript plugin only for a rule that comes from it', () => {
    const emitted = emitLint(
      defineBlueprint({ ...blueprint, framework: 'vue', rules: { deepWatch: 'error' } }),
      { typescript: { rules: {} } },
    );

    const shared = emitted.find((entry) => entry.rules?.['blueprint/no-deep-watch']);

    expect(shared?.plugins?.blueprint).toBeDefined();
    expect(shared?.plugins).not.toHaveProperty('@typescript-eslint');
  });
});
