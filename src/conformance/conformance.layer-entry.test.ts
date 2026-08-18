import { beforeAll, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { cli, configSource, lintFixture, makeRepo, react, rm } from './conformance';
import type { Verdict } from './conformance';

/**
 * AC17 — a forbidden layer's ENTRY, judged by both readers over one tree.
 *
 * `inspect` has always reported a bare `~app/<forbidden-layer>` as a flow
 * violation, and the emitted config banned only `~app/<forbidden-layer>/**` —
 * descendants. So the two artifacts one config compiles into disagreed about
 * the one spelling an agent reaches for first, on flat repos and modular ones
 * alike, and a green lint said the import was fine.
 *
 * The cases run twice against the same layer pair, once flat and once one depth
 * inside a module, from ONE list — the claim is that the module axis changes
 * the address and nothing else, and two hand-written lists could agree about
 * that by coincidence. Both readers judge one fixture per structure: an "it is
 * caught" and an "it is still allowed" reached by separate runs never met the
 * same config.
 */

/** The two layers, in the one order that makes `services` → `components` illegal. */
const layers = [
  { name: 'components', does: 'render UI' },
  { name: 'services', does: 'data access' },
];

/** `folder` layout, so the entry-only ban this fix must NOT move is live too. */
const folder = { layout: 'folder' as const, entry: 'index', private: [] };

const flatBlueprint: Blueprint = {
  framework: 'react',
  architecture: { alias: '~app', layers, folder },
};

/**
 * The same layers one depth down. Two modules, and every case below is addressed
 * under the SECOND — the ban's module prefix has to come from the net's own
 * module, and a prefix taken from the declared list's first entry would spell
 * every ban `~app/Shell/...` while these files import `~app/Combat/...`. Under
 * the first module that substitution is invisible.
 */
const modularBlueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    layers,
    modules: [
      { name: 'Shell', does: 'app frame' },
      { name: 'Combat', does: 'the fight loop' },
    ],
    folder,
  },
};

/** A ban both readers must reach, named by the words each one says it in. */
interface Ban {
  /** A needle of the emitted `no-restricted-imports` message. */
  message: string;
  /** The `inspect` finding's rule id. */
  rule: string;
}

const FLOW: Ban = { message: '🚫 This import violates the dependency flow', rule: 'flow-violation' };
const ENTRY: Ban = { message: '🚫 Import a folder through its entry', rule: 'deep-import' };

/** One import, and the verdict both readers owe it. */
interface Case {
  what: string;
  /** The importing file, under the structure's own prefix. */
  file: string;
  source: string;
  /** The ban that must fire, or null when both readers must stay silent. */
  ban: Ban | null;
}

/**
 * The ruling's three cases, addressed under `prefix` — `''` flat, `'Combat/'`
 * inside a module. The last two are the boundary the third case is about: an
 * allowed layer's folder is still reachable at its entry and still closed one
 * segment past it, so "no overcorrection" is a ban that stayed put rather than
 * a ban that went missing.
 */
const cases = (prefix: string): Case[] => [
  {
    what: 'a forbidden layer\'s bare entry',
    file: `src/${prefix}services/bare.js`,
    source: `~app/${prefix}components`,
    ban: FLOW,
  },
  {
    what: 'a forbidden layer\'s deep path',
    file: `src/${prefix}services/deep.js`,
    source: `~app/${prefix}components/Button`,
    ban: FLOW,
  },
  {
    what: 'an allowed downstream layer\'s bare entry',
    file: `src/${prefix}components/allowed.js`,
    source: `~app/${prefix}services`,
    ban: null,
  },
  {
    what: 'an allowed downstream layer\'s folder entry',
    file: `src/${prefix}components/entry.js`,
    source: `~app/${prefix}services/api`,
    ban: null,
  },
  {
    what: 'an allowed downstream layer\'s folder internals',
    file: `src/${prefix}components/inside.js`,
    source: `~app/${prefix}services/api/impl`,
    ban: ENTRY,
  },
];

/**
 * The fixture tree: one file per case, plus the folders those imports name.
 * The targets are real folders with entries, so "clean" is a verdict about a
 * path that exists rather than about one that resolves nowhere.
 */
const tree = (structure: Structure): Record<string, string> => ({
  ...Object.fromEntries(cases(structure.prefix).map((entry, index) =>
    [entry.file, `import '${entry.source}';\nexport const case${index} = 1;\n`])),
  [`src/${structure.prefix}components/Button/index.js`]: 'export const Button = 1;\n',
  [`src/${structure.prefix}services/api/index.js`]: 'export const api = 1;\n',
  [`src/${structure.prefix}services/api/impl.js`]: 'export const impl = 1;\n',
  ...structure.scaffold,
});

interface Finding {
  rule: string;
  path: string;
  message: string;
}

interface Reading {
  eslint: Map<string, Verdict[]>;
  findings: Finding[];
  /** Every file the lint run actually reached, sorted. */
  linted: string[];
}

/** Both readers over one fixture: the real emitter through real ESLint, and `inspect`. */
async function read(blueprint: Blueprint, files: Record<string, string>): Promise<Reading> {
  const dir = makeRepo({
    packageJson: react(),
    files: { 'blueprint.config.mjs': configSource(blueprint), ...files },
  });

  try {
    const eslint = await lintFixture(dir, blueprint, ['src/**/*.js']);

    const report = JSON.parse((await cli(dir, ['inspect', '--json'])).output) as {
      findings: Finding[];
    };

    return { eslint, findings: report.findings, linted: [...eslint.keys()].sort() };
  } finally {
    rm(dir);
  }
}

/** One structure to run the whole list against. */
interface Structure {
  label: string;
  blueprint: Blueprint;
  /** What every address in `cases` is written under. */
  prefix: string;
  /** Files the structure itself owes, so no finding here is about its shape. */
  scaffold: Record<string, string>;
  /**
   * `rule path` for every `inspect` finding this fixture's own SHAPE produces —
   * a folder that has not been written yet, which is not a verdict about any
   * import. Enumerated rather than filtered by severity, so a new kind of
   * finding arriving here turns this red instead of being absorbed.
   */
  residual: string[];
}

const STRUCTURES: Structure[] = [
  { label: 'flat', blueprint: flatBlueprint, prefix: '', scaffold: {}, residual: [] },
  {
    label: 'modular',
    blueprint: modularBlueprint,
    // The second declared module, not the first — see `modularBlueprint`.
    prefix: 'Combat/',
    // Both declared modules, each with the entry a module is reached at.
    // Without them `inspect` reports the missing entry and the module with no
    // folder yet — true, and about the fixture rather than about any import.
    scaffold: {
      'src/Shell/index.js': 'export const Shell = 1;\n',
      'src/Combat/index.js': 'export const Combat = 1;\n',
    },
    // `Shell` holds only its entry, so both declared layers are runway there.
    residual: ['missing-layer src/Shell/components', 'missing-layer src/Shell/services'],
  },
];

describe.each(STRUCTURES)('AC17 · $label · a forbidden layer\'s entry', (structure) => {
  const { blueprint, prefix } = structure;
  const files = tree(structure);
  let reading: Reading;

  beforeAll(async () => {
    reading = await read(blueprint, files);
  }, 60000);

  it('linted every file of the fixture — the run these verdicts come from', () => {
    // A glob one segment wrong hands ESLint no file at all, and a run that
    // linted nothing satisfies every "is clean" assertion below.
    expect(reading.linted).toEqual(Object.keys(files).sort());
  });

  it.each(cases(prefix))('$what — eslint', ({ file, source, ban }) => {
    const verdicts = reading.eslint.get(file) as Verdict[];

    if (!ban) {
      expect(verdicts).toEqual([]);

      return;
    }

    // One message, not two: the bare spelling and the descendant one ride in a
    // single group, and `no-restricted-imports` reports once per group — two
    // groups matching one import would split one debt into two fixes.
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].rule).toBe('no-restricted-imports');
    expect(verdicts[0].message).toContain(`'${source}' import is restricted`);
    expect(verdicts[0].message).toContain(ban.message);
  });

  it.each(cases(prefix))('$what — inspect', ({ file, source, ban }) => {
    // These pin AGREEMENT, not the ban. `inspect` reports a forbidden layer's
    // bare entry whether or not the emitted config does, so every case here
    // reads the same on both sides of any change to the emitted globs — which
    // is the reason they stay rather than a reason to prune them: the claim
    // this file makes is that the two readers say the same thing, and the
    // eslint block above can only ever measure one of the two.
    const found = reading.findings.filter((finding) => finding.path === file);

    expect(found.map((finding) => finding.rule)).toEqual(ban ? [ban.rule] : []);

    if (ban) {
      expect(found[0].message).toContain(source);
    }
  });

  it('leaves the two readers with the same list of files to object to', () => {
    // The disagreement this AC exists for, stated as one comparison rather than
    // as two lists that happen to match case by case above.
    const onDisk = new Set(Object.keys(files));

    const byEslint = [...reading.eslint.entries()]
      .filter(([, verdicts]) => verdicts.length)
      .map(([file]) => file)
      .sort();

    const byInspect = [...new Set(reading.findings
      .filter((finding) => onDisk.has(finding.path))
      .map((finding) => finding.path))].sort();

    expect(byEslint).toEqual(byInspect);

    expect(byEslint).toEqual(
      cases(prefix).filter((entry) => entry.ban).map((entry) => entry.file).sort(),
    );
  });

  it('says nothing else about the tree beyond its own unwritten folders', () => {
    // The comparison above is between files; this is what it left out. A
    // finding whose path is a folder rather than a file sits outside it, so
    // without this one an extra folder-scoped finding would be reported by
    // neither assertion.
    const onDisk = new Set(Object.keys(files));

    const residual = reading.findings
      .filter((finding) => !onDisk.has(finding.path))
      .map((finding) => `${finding.rule} ${finding.path}`)
      .sort();

    expect(residual).toEqual(structure.residual);
  });
});
