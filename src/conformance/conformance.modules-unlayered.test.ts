import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { cli, configSource, lintFixture, makeRepo, react, rm } from './conformance';
import type { Verdict } from './conformance';

/**
 * A module that declared `layers: false` is one governance scope — asserted on
 * one fixture repo, by both readers of it.
 *
 * The layer names are architecture-wide, so a module holding its files directly
 * can still have a folder called `hooks`. Judged against those names it was told
 * `../hooks` "leaves this layer — use the alias", while the same module's own
 * self-ban forbids `~app/common/hooks` — a file with no legal way to import its
 * neighbour, and both readers said it. So the fixture holds that exact collision
 * and asks `eslint` and `inspect` about it in one repo: the property at stake is
 * that the two agree, and two fixtures cannot show agreement about one tree.
 *
 * The layered module beside it is not scenery. "No layer boundary here" and "no
 * layer boundary anywhere" pass the same assertions on a fixture that has only
 * the opt-out module, and the second is how the layer model gets switched off by
 * a fix aimed at one corner of it.
 */

const unlayeredBlueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'components', does: 'render UI' },
      { name: 'hooks', does: 'state' },
    ],
    modules: [
      { name: 'App', does: 'the app frame' },
      { name: 'common', does: 'shared helpers', layers: false },
    ],
    folder: { layout: 'flat', entry: 'index', private: [] },
  },
};

const FILES: Record<string, string> = {
  'src/App/index.js': 'export const App = 1;\n',
  // The control, and the reason the fixture is mixed: the identical import from
  // the identical folder name, in the module that kept the layers. A fix that
  // reads the opt-out too widely turns this one green too.
  'src/App/components/Board.js': [
    'import \'../hooks\';',
    'export const Board = 1;',
    '',
  ].join('\n'),
  'src/App/hooks/index.js': 'export const useApp = 1;\n',
  'src/common/index.js': 'export const common = 1;\n',
  // Two folders inside the opt-out module, named exactly as the two declared
  // layers are. Nothing stops an adopter naming them that, and nothing should.
  'src/common/hooks/index.js': 'export const clamp = 1;\n',
  'src/common/hooks/round.js': 'export const round = 1;\n',
  'src/common/components/x.js': [
    'import \'../hooks\';',
    'export const x = 1;',
    '',
  ].join('\n'),
  // One segment past that folder's entry — inside a module holding its files
  // directly there is no entry to be past, at any depth.
  'src/common/components/deep.js': [
    'import \'../hooks/round\';',
    'export const deep = 1;',
    '',
  ].join('\n'),
  // The route the old message sent this file to. It is banned, and stays banned:
  // the dead end dissolves because the relative import above stopped being a
  // violation, not because the same-module ban was loosened to admit the advice.
  'src/common/components/aliased.js': [
    'import \'~app/common/hooks\';',
    'export const aliased = 1;',
    '',
  ].join('\n'),
};

interface InspectReport {
  ok: boolean;
  findings: { rule: string; path: string; severity: string; message: string }[];
}

let dir = '';
let byFile: Map<string, Verdict[]>;
let report: InspectReport;

beforeAll(async () => {
  dir = makeRepo({
    packageJson: react(),
    files: { 'blueprint.config.mjs': configSource(unlayeredBlueprint), ...FILES },
  });

  byFile = await lintFixture(dir, unlayeredBlueprint, ['src/**/*.js']);
  report = JSON.parse((await cli(dir, ['inspect', '--json'])).output) as InspectReport;
});

afterAll(() => {
  rm(dir);
});

/** One file's verdicts — absent (never linted) is a different answer from clean. */
const at = (file: string): Verdict[] => byFile.get(file) as Verdict[];

/** The one message `file` produced — asserted as one, so a second is a red. */
function onlyMessage(file: string): string {
  const verdicts = at(file);

  expect(verdicts).toHaveLength(1);

  return verdicts[0].message;
}

describe('a `layers: false` module, as the real linter reads it', () => {
  it('reaches every file of the fixture — the run these verdicts come from', () => {
    // A glob one segment wrong hands ESLint no file at all, and a run that linted
    // nothing satisfies every "is clean" assertion below.
    expect([...byFile.keys()].sort()).toEqual(Object.keys(FILES).sort());
  });

  it('lets one of its folders relatively import another, layer name or not', () => {
    expect(at('src/common/components/x.js')).toEqual([]);
    expect(at('src/common/components/deep.js')).toEqual([]);
  });

  it('keeps the same-module alias ban shut over exactly those folders', () => {
    // `~app/common/**`, not `~app/common/*` with the layer names negated out of
    // it — the negated form is what the module-flow ban compiles to when the
    // module is read as layered, and it leaves this line unreported.
    expect(onlyMessage('src/common/components/aliased.js'))
      .toContain('🚫 Same-module imports must be relative');
  });

  it('still catches the identical import inside the module that kept its layers', () => {
    expect(onlyMessage('src/App/components/Board.js'))
      .toContain('Relative import "../hooks" leaves this layer');
  });
});

describe('a `layers: false` module, as inspect reads the same tree', () => {
  it('reaches the same verdict about every file the linter judged', () => {
    // The property this whole finding is about: the two agreed before, and were
    // both wrong. Compared as the set of files each one has something to say
    // about, so a reader that goes quiet — or starts talking — is a red here.
    const flaggedByLint = [...byFile]
      .filter(([, verdicts]) => verdicts.length)
      .map(([file]) => file)
      .sort();

    expect(report.findings.filter((finding) => finding.severity === 'error').map((f) => f.path))
      .toEqual(flaggedByLint);
  });

  it('names the same two violations, by rule and by path, and nothing else', () => {
    expect(report.findings.map((finding) => [finding.rule, finding.path])).toEqual([
      ['relative-escape', 'src/App/components/Board.js'],
      ['flow-violation', 'src/common/components/aliased.js'],
    ]);

    expect(report.ok).toBe(false);
  });

  it('words each one as its own reader does', () => {
    const [layered, alias] = report.findings.map((finding) => finding.message);

    expect(layered).toContain('Relative import "../hooks" leaves this layer');
    expect(alias).toContain('Same-module import "~app/common/hooks" via the alias');
  });
});
