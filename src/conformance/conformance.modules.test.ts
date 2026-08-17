import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { lintFixture, makeRepo, modularBlueprint, react, rm } from './conformance';
import type { Verdict } from './conformance';

/**
 * `architecture.modules`, enforced by the real linter over a real repo.
 *
 * The unit suites under `src/emit/lint/` already prove the emitted config holds
 * the module-axis bans; they prove it by reading the config object. This asks
 * the other question — what an adopter's own `eslint` run actually says about
 * files on disk — because a ban that is present in the config and unreachable
 * by any real path is indistinguishable from a correct one at that layer, and
 * a modular repo is exactly where a glob goes one segment wrong.
 *
 * ONE fixture, linted once. AC2 requires both arms of the paired alias case in
 * the same fixture, and the same reason holds for every claim below: a legal
 * import and the violation beside it have to be judged by one config, or "it
 * passes" and "it is caught" are two runs that never met.
 */

/**
 * Every file the fixture repo holds, each written for one claim. The legal
 * imports are not scenery: a ban that fires on everything satisfies every
 * negative assertion here, and the clean files are what refuses it.
 */
const FILES: Record<string, string> = {
  // Shell's own root-file group. Its own inner layer, relatively; three
  // modules it may reach, each at its bare entry.
  'src/Shell/index.js': [
    'import \'./hooks/useShell\';',
    'import \'~app/Combat\';',
    'import \'~app/Lobby\';',
    'import \'~app/common\';',
    'export const Shell = 1;',
    '',
  ].join('\n'),
  // The same group, reaching past two entries — one into a layered module,
  // one into a module that holds its files directly.
  'src/Shell/deep.js': [
    'import \'~app/Combat/hooks/useFight\';',
    'import \'~app/common/math/clamp\';',
    'export const deep = 1;',
    '',
  ].join('\n'),
  // selfOnly at the module depth: the dependency is allowed, the re-export is not.
  'src/Shell/reexport.js': [
    'import \'~app/Lobby\';',
    'export { seat } from \'~app/Lobby\';',
    '',
  ].join('\n'),
  // A declared layer inside a module, reaching two entries it is allowed to.
  'src/Shell/components/Frame.js': [
    'import \'~app/Combat\';',
    'import \'~app/Lobby\';',
    'export const Frame = 1;',
    '',
  ].join('\n'),
  // The same layer, past an entry — and at a primitive another module owns.
  'src/Shell/components/Deep.js': [
    'import \'~app/Combat/hooks/useFight\';',
    'import \'zustand\';',
    'export const Deep = 1;',
    '',
  ].join('\n'),
  // An inner layer reaching back to its own module's root file.
  'src/Shell/hooks/useShell.js': [
    'import \'../index\';',
    'export const useShell = 1;',
    '',
  ].join('\n'),
  'src/Combat/index.js': [
    'import \'~app/common\';',
    'export const Combat = 1;',
    '',
  ].join('\n'),
  // Both cross-module violations: the declared-order edge run backwards, and
  // the edge `Lobby`'s own allowedImporters narrowed Combat out of.
  'src/Combat/upstream.js': [
    'import \'~app/Shell\';',
    'import \'~app/Lobby\';',
    'export const upstream = 1;',
    '',
  ].join('\n'),
  // AC2's paired alias case, both arms.
  'src/Combat/components/Fighter.js': [
    'import \'~app/Combat\';',
    'import \'~app/Combat/hooks\';',
    'export const Fighter = 1;',
    '',
  ].join('\n'),
  // A layer inside the module that owns the primitive.
  'src/Combat/hooks/useFight.js': [
    'import \'zustand\';',
    'export const useFight = 1;',
    '',
  ].join('\n'),
  'src/Lobby/index.js': 'export const Lobby = 1;\n',
  'src/common/index.js': 'export const common = 1;\n',
  // Two folders down inside a `layers: false` module — one net for the whole
  // subtree, so the module-axis bans have to reach here.
  'src/common/math/clamp.js': [
    'import \'~app/Shell\';',
    'import \'~app/common/other\';',
    'export const clamp = 1;',
    '',
  ].join('\n'),
};

let dir = '';
let byFile: Map<string, Verdict[]>;

beforeAll(async () => {
  dir = makeRepo({ packageJson: react(), files: FILES });
  byFile = await lintFixture(dir, modularBlueprint, ['src/**/*.js']);
});

afterAll(() => {
  rm(dir);
});

/** One file's verdicts — absent (never linted) is a different answer from clean. */
const at = (file: string): Verdict[] => byFile.get(file) as Verdict[];

const rulesAt = (file: string): (string | null)[] => at(file).map((verdict) => verdict.rule);

/** The one message `file` produced — asserted as one, so a second is a red. */
function onlyMessage(file: string): string {
  const verdicts = at(file);

  expect(verdicts).toHaveLength(1);

  return verdicts[0].message;
}

describe('AC2 · the module flow, as the real linter reads it', () => {
  it('reaches every file of the fixture — the run these verdicts come from', () => {
    // A modular glob that is one segment wrong hands ESLint no file at all, and
    // a run that linted nothing satisfies every "is clean" assertion below.
    expect([...byFile.keys()].sort()).toEqual(Object.keys(FILES).sort());
  });

  it('passes the declared-order edge and the narrowed one, at both depths', () => {
    // `Combat` names no allowedImporters, so declaration order alone permits
    // `Shell` → `Combat`; `Lobby` narrows the same default to `Shell`. Both
    // are legal here, from the module's own root file and from a layer inside it.
    expect(at('src/Shell/index.js')).toEqual([]);
    expect(at('src/Shell/components/Frame.js')).toEqual([]);
  });

  it('catches the same two edges run the other way, from one file', () => {
    // Backwards on the declared-order edge, and across the narrowed one that
    // declaration order alone would have allowed — the whole point of
    // `allowedImporters` narrowing rather than granting.
    expect(rulesAt('src/Combat/upstream.js'))
      .toEqual(['no-restricted-imports', 'no-restricted-imports']);

    const [shell, lobby] = at('src/Combat/upstream.js').map((verdict) => verdict.message);

    expect(shell).toContain('\'~app/Shell\' import is restricted');
    expect(shell).toContain('"Combat" may not import this module');
    expect(lobby).toContain('\'~app/Lobby\' import is restricted');
    expect(lobby).toContain('"Combat" may not import this module');
  });
});

describe('AC2 · entry-only, from both file groups a module has', () => {
  const past = '🚫 Import a module through its entry, not its internals';

  it('bans reaching past an entry from the module\'s own root files', () => {
    // Two targets: a layered module and one holding its files directly. The
    // bare spelling of each passed in `Shell/index.js` above, so this is the
    // boundary and not a blanket ban on the module name.
    expect(rulesAt('src/Shell/deep.js'))
      .toEqual(['no-restricted-imports', 'no-restricted-imports']);

    const [layered, direct] = at('src/Shell/deep.js').map((verdict) => verdict.message);

    expect(layered).toContain('\'~app/Combat/hooks/useFight\' import is restricted');
    expect(layered).toContain(past);
    expect(direct).toContain('\'~app/common/math/clamp\' import is restricted');
    expect(direct).toContain(past);
  });

  it('bans it from a declared layer inside the module too', () => {
    // The root-file group and a layer nested inside the module are two separate
    // emitted entries; one of them carrying the ban proves nothing about the other.
    expect(at('src/Shell/components/Deep.js')[0].message)
      .toContain('\'~app/Combat/hooks/useFight\' import is restricted');

    expect(at('src/Shell/components/Deep.js')[0].message).toContain(past);
  });
});

describe('AC2 · the root ↔ inner-layer direction, both routes', () => {
  it('lets a module\'s root file relatively import its own inner layer', () => {
    // `Shell/index.js` opens with `./hooks/useShell` and is clean above — a
    // file at the module root is in no layer, so it has no layer to leave.
    expect(at('src/Shell/index.js')).toEqual([]);
  });

  it('catches an inner layer relatively reaching back to that same root file', () => {
    expect(rulesAt('src/Shell/hooks/useShell.js')).toEqual(['blueprint/relative-escape']);

    const message = onlyMessage('src/Shell/hooks/useShell.js');

    expect(message).toContain('Relative import "../index" leaves this layer');
  });

  it('catches the alias route back to the module root, and leaves the '
    + 'cross-layer one alone', () => {
    // The pair, in one file and under one config. The first line is the
    // loophole an alias-shaped fix has to keep shut; the second is the ordinary
    // intra-module cross-layer import an over-broad fix takes down with it.
    // Asserting either alone passes a broken implementation on the other side.
    const message = onlyMessage('src/Combat/components/Fighter.js');

    expect(message).toContain('\'~app/Combat\' import is restricted');
    expect(message).toContain('🚫 Same-module imports must be relative');
    // …and nothing was said about `~app/Combat/hooks`, the line beside it.
    expect(message).not.toContain('~app/Combat/hooks');
  });
});

describe('AC11 · owns declared on a module cascades, and bars', () => {
  it('lets a layer inside the owning module use the primitive', () => {
    // `Combat` owns `zustand`; `Combat/hooks` never declared anything.
    expect(at('src/Combat/hooks/useFight.js')).toEqual([]);
  });

  it('bars a layer inside another module, and names the owning module', () => {
    // "its owning layer" would send the reader to `architecture.layers`, where
    // this declaration is not — the module is named outright.
    const [, owned] = at('src/Shell/components/Deep.js').map((verdict) => verdict.message);

    expect(owned).toContain('\'zustand\' import is restricted');
    expect(owned).toContain('🚫 Do not import "zustand" here — it is owned by module "Combat".');
  });
});

describe('AC12 · selfOnly at the module depth', () => {
  it('allows the dependency and catches the re-export, in one file', () => {
    // `Lobby` lets `Shell` import it, selfOnly. Line 1 is that import and is
    // silent; line 2 re-exports the same module and is not. One message from a
    // file holding both is what says the ban is the re-export, not the module.
    expect(rulesAt('src/Shell/reexport.js')).toEqual(['no-restricted-syntax']);

    expect(onlyMessage('src/Shell/reexport.js')).toContain(
      '🚫 Cannot re-export from "Lobby" — a selfOnly dependency must not be exposed to callers.',
    );
  });
});

describe('AC13a · a `layers: false` module is governed by the same run', () => {
  it('carries the module-axis bans two folders deep inside it', () => {
    // The whole subtree is one net, so a ban that only reached the module's top
    // level would leave this file ungoverned while every unit test stayed green.
    expect(rulesAt('src/common/math/clamp.js'))
      .toEqual(['no-restricted-imports', 'no-restricted-imports']);

    const [upstream, self] = at('src/common/math/clamp.js').map((verdict) => verdict.message);

    expect(upstream).toContain('"common" may not import this module');
    expect(self).toContain('\'~app/common/other\' import is restricted');
    expect(self).toContain('🚫 Same-module imports must be relative');
  });

  it('leaves its entry file and the entry reach into it alone', () => {
    // `~app/common` from two other modules (Shell's root file and Combat's)
    // passed above; the module's own entry file has nothing said about it.
    expect(at('src/common/index.js')).toEqual([]);
    expect(at('src/Combat/index.js')).toEqual([]);
  });
});
