import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { defineBlueprint } from '../../config';
import { emitLint } from './lint';

const blueprint = defineBlueprint({
  framework: 'auto',
  architecture: {
    alias: '~app',
    additionalAliases: { '~root': '.' },
    layers: [
      { name: 'pages', does: 'routes' },
      { name: 'hooks', does: 'state', layout: 'folder' },
      { name: 'services', does: 'net' },
    ],
  },
});

const config = [
  { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
  ...emitLint(blueprint),
];

const linter = new Linter({ configType: 'flat' });

const PAGE = 'src/pages/Home.ts';
const HOOK = 'src/hooks/useX/index.ts';
const SERVICE = 'src/services/api.ts';

const FLOW = 'violates the dependency flow';
const SAME_LAYER = 'Same-layer imports must be relative';
const DEEP = 'Import a unit through its entry';

function bans(specifier: string, filename: string): string[] {
  const messages = linter.verify(`import x from "${specifier}";`, config, { filename });
  const unmatched = messages.filter((message) => message.ruleId === null);

  expect(unmatched.map((message) => message.message)).toEqual([]);

  return messages
    .filter((message) => message.ruleId === 'no-restricted-imports')
    .map((message) => message.message);
}

function bannedBy(specifier: string, filename: string, clause: string): boolean {
  const messages = bans(specifier, filename);

  return messages.length === 1 && messages[0].includes(clause);
}

describe('emitLint · a forbidden layer\'s own entry (#382 site A)', () => {
  it('reports the bare entry of every forbidden layer, not only the first', () => {
    expect(bannedBy('~app/pages', SERVICE, FLOW)).toBe(true);
    expect(bannedBy('~app/pages/detail', SERVICE, FLOW)).toBe(true);

    expect(bannedBy('~app/hooks', SERVICE, FLOW)).toBe(true);
    expect(bannedBy('~app/hooks/useX', SERVICE, FLOW)).toBe(true);
  });
});

describe('emitLint · a layer\'s own entry through the same-layer ban (#382 site B)', () => {
  it('reports a flat layer\'s bare entry, with the same-layer message', () => {
    expect(bannedBy('~app/services', SERVICE, SAME_LAYER)).toBe(true);
    expect(bannedBy('~app/services/api', SERVICE, SAME_LAYER)).toBe(true);

    expect(bans('~app/services', SERVICE)[0]).not.toContain(FLOW);
  });

  it('reports a folder layer\'s bare entry, with the same-layer message', () => {
    expect(bannedBy('~app/hooks', HOOK, SAME_LAYER)).toBe(true);
    expect(bannedBy('~app/hooks/useX', HOOK, SAME_LAYER)).toBe(true);

    expect(bans('~app/hooks', HOOK)[0]).not.toContain(FLOW);
  });

  it('names the entry in the message, so the bare spelling explains itself', () => {
    expect(bans('~app/services', SERVICE)[0])
      .toContain('"~app/services" and everything under it is banned');

    expect(bans('~app/hooks', HOOK)[0])
      .toContain('"~app/hooks" and everything under it is banned');
  });
});

describe('emitLint · what the widened bans still let through (#382)', () => {
  it('leaves a sibling folder whose name only starts with a layer name alone', () => {
    expect(bans('~app/pagesx', SERVICE)).toEqual([]);
    expect(bannedBy('~app/pages', SERVICE, FLOW)).toBe(true);
  });

  it('leaves an allowed lower layer\'s entry importable', () => {
    expect(bans('~app/services', PAGE)).toEqual([]);
    expect(bannedBy('~app/pages', PAGE, SAME_LAYER)).toBe(true);
  });

  it('keeps the entry-only exemption for a folder-layout module', () => {
    expect(bans('~app/hooks/useX', PAGE)).toEqual([]);
    expect(bannedBy('~app/hooks/useX/impl', PAGE, DEEP)).toBe(true);
  });
});

describe('emitLint · the entry through an additional alias (#382)', () => {
  it('reports the bare entry through every alias, not only the first', () => {
    expect(bannedBy('~root/src/pages', SERVICE, FLOW)).toBe(true);
    expect(bannedBy('~root/src/pages/detail', SERVICE, FLOW)).toBe(true);

    expect(bannedBy('~root/src/services', SERVICE, SAME_LAYER)).toBe(true);
  });
});

describe('emitLint · the groups the widened bans are composed of (#382)', () => {
  const groupsFor = (filename: string) => {
    const entry = emitLint(blueprint).find((candidate) =>
      candidate.files?.some((glob) => glob.startsWith(filename)));

    const rule = entry?.rules?.['no-restricted-imports'] as
      [string, { patterns: { group: string[] }[] }];

    return rule[1].patterns.map((pattern) => pattern.group);
  };

  it('carries the entry beside the descendants glob, never instead of it', () => {
    const groups = groupsFor('src/services/');

    expect(groups).toContainEqual(['~app/services', '~app/services/**']);
    expect(groups).toContainEqual(['~root/src/services', '~root/src/services/**']);

    expect(groups).toContainEqual([
      '~app/pages',
      '~app/pages/**',
      '~root/src/pages',
      '~root/src/pages/**',
      '~app/hooks',
      '~app/hooks/**',
      '~root/src/hooks',
      '~root/src/hooks/**',
    ]);
  });

  it('leaves the module entry-only ban a descendants glob alone', () => {
    expect(groupsFor('src/pages/')).toContainEqual(['~app/hooks/*/**', '~root/src/hooks/*/**']);
  });
});

const selfOnly = defineBlueprint({
  framework: 'auto',
  architecture: {
    alias: '~app',
    additionalAliases: { '~root': '.' },
    layers: [
      { name: 'pages', does: 'routes' },
      { name: 'contexts', does: 'state', allowedImporters: [{ layer: 'pages', selfOnly: true }] },
      { name: 'services', does: 'net' },
    ],
  },
});

const selfOnlyConfig = [
  { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
  ...emitLint(selfOnly),
];

function reexportBans(code: string): string[] {
  const messages = linter.verify(code, selfOnlyConfig, { filename: PAGE });
  const unmatched = messages.filter((message) => message.ruleId === null);

  expect(unmatched.map((message) => message.message)).toEqual([]);

  return messages
    .filter((message) => message.ruleId === 'no-restricted-syntax')
    .map((message) => message.message);
}

const REEXPORT = 'Cannot re-export from "contexts"';

describe('emitLint · a selfOnly target\'s own entry (#382 site C)', () => {
  it('reports the bare entry re-exported by star and by name', () => {
    expect(reexportBans('export * from "~app/contexts";')).toHaveLength(1);
    expect(reexportBans('export * from "~app/contexts";')[0]).toContain(REEXPORT);

    expect(reexportBans('export { a } from "~app/contexts";')).toHaveLength(1);
  });

  it('still reports a descendant, and still leaves a name-prefixed sibling alone', () => {
    expect(reexportBans('export * from "~app/contexts/theme";')).toHaveLength(1);

    expect(reexportBans('export * from "~app/contexts-x/theme";')).toEqual([]);
    expect(reexportBans('export * from "~app/contextsy";')).toEqual([]);
  });

  it('reports the bare entry through every alias, not only the first', () => {
    expect(reexportBans('export * from "~root/src/contexts";')).toHaveLength(1);
    expect(reexportBans('export * from "~root/src/contexts/theme";')).toHaveLength(1);
  });

  it('still lets the selfOnly target be imported, entry included', () => {
    expect(reexportBans('import { a } from "~app/contexts";')).toEqual([]);
    expect(reexportBans('import { a } from "~app/contexts/theme";')).toEqual([]);
  });
});

describe('emitLint · the selfOnly selectors it emits (#382 site C)', () => {
  const regexLiterals = (): string[] =>
    emitLint(selfOnly)
      .flatMap((entry) => {
        const rule = entry.rules?.['no-restricted-syntax'] as
          [string, ...{ selector: string }[]] | undefined;

        return rule ? rule.slice(1) as { selector: string }[] : [];
      })
      .flatMap(({ selector }) =>
        [...selector.matchAll(/\[source\.value=\/(.+?)\/\]/g)].map(([, body]) => body));

  it('spells every separator as the escape — no raw slash, no backslashed one', () => {
    const bodies = regexLiterals();

    expect(bodies.length).toBeGreaterThan(0);

    for (const body of bodies) {
      expect(body).not.toContain('/');
      expect(body).not.toContain('\\/');
    }
  });

  it('matches the entry and everything under it, once per alias', () => {
    const hits = (specifier: string) =>
      new Set(regexLiterals().filter((body) => new RegExp(body).test(specifier))).size;

    expect(hits('~app/contexts')).toBe(1);
    expect(hits('~app/contexts/theme')).toBe(1);
    expect(hits('~root/src/contexts')).toBe(1);
    expect(hits('~root/src/contexts/theme')).toBe(1);

    expect(hits('~app/contexts-x/theme')).toBe(0);
    expect(hits('~app/contextsy')).toBe(0);
  });
});
