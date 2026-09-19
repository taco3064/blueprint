import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RepositoryBlueprint, ProjectState } from '../project';
import {
  legacyOutcome,
  legacyUpgradeNote,
  migrateLegacyRepositoryCheckpoint,
} from './legacy-upgrade';

let repository: string;
let state: ProjectState;
const original = '// owner policy\r\nexport default {};\r\n';

beforeEach(() => {
  repository = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-upgrade-'));

  state = {
    applicationRoot: path.join(repository, 'apps/web'), repositoryRoot: repository,
  } as ProjectState;

  for (const app of ['web', 'admin']) {
    const dir = path.join(repository, 'apps', app);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'blueprint.config.mjs'), original);
  }
});

afterEach(() => fs.rmSync(repository, { recursive: true, force: true }));

const declarations = [{ layer: 'pages', layout: 'folder' }, { layer: 'hooks' }];

function blueprint(
  application: string,
  legacy: 'rewritten' | 'manual' | null,
): RepositoryBlueprint {
  const architecture = { alias: '~app', layers: [{ name: 'pages', does: 'routes' }] };

  return {
    applicationRoot: path.join(repository, 'apps', application),
    architecture,
    blueprint: { framework: 'react', architecture },
    legacyConfig: legacy !== null,
    legacySource: legacy === 'rewritten'
      ? { kind: 'rewritten', source: `export default { name: '${application}' };\n` }
      : legacy === 'manual' ? { kind: 'manual', declarations } : null,
    topology: 'layer-first',
  };
}

describe('legacy repository checkpoint', () => {
  it('describes single-app and repository-wide phase-one scope precisely', () => {
    expect(legacyUpgradeNote({ topology: 'module-first' }, { rewritten: 1, manual: [] }))
      .toContain('migrated the config to valid 4.0 layer-first');

    expect(legacyUpgradeNote({ topology: 'module-first' }, { rewritten: 2, manual: [] }))
      .toContain('migrated all 2 Blueprint configs in the repository');

    expect(legacyUpgradeNote(
      { topology: 'module-first', dryRun: true },
      { rewritten: 2, manual: [] },
    )).toContain('would migrate all 2 Blueprint configs in the repository');
  });

  it('names the keys an unrewritable config needs instead of claiming a migration', () => {
    const note = legacyUpgradeNote({}, {
      rewritten: 0,
      manual: [{
        config: 'blueprint.config.mjs',
        declarations: [
          { layer: 'pages', layout: 'folder' },
          { layer: 'hooks', layout: 'folder', entry: 'use' },
          { layer: 'services' },
        ],
      }],
    });

    expect(note).toBe('blueprint.config.mjs is unchanged: its Blueprint 3.2 unit-shape keys are '
      + 'not literal properties, so Blueprint cannot rewrite them without running the file. '
      + 'Rewrite them by hand: remove `architecture.module` and every layer\'s `module`, then '
      + 'declare `layout: \'folder\'` on `pages`, `hooks`; `entry: \'use\'` on `hooks`.');
  });

  it('keeps the defaults when an unrewritable config declares no layer shape', () => {
    expect(legacyUpgradeNote({ dryRun: true }, {
      rewritten: 0, manual: [{ config: 'a.mjs', declarations: [{ layer: 'pages' }] }],
    })).toContain('then keep every layer on the 4.x defaults (`layout: \'file\'`, '
      + '`entry: \'index\'`).');
  });

  it('counts rewritten configs against every 3.2 config when some stay manual', () => {
    const manual = { config: path.join('apps/admin/blueprint.config.mjs'), declarations };

    for (const [dryRun, verb] of [[false, 'migrated'], [true, 'would migrate']] as const) {
      const note = legacyUpgradeNote(
        { topology: 'module-first', dryRun },
        { rewritten: 1, manual: [manual] },
      );

      expect(note).toContain(`${verb} 1 of the repository's 2 Blueprint 3.2 configs to valid`);
      expect(note).toContain(`${manual.config} is unchanged`);
    }
  });

  it('does nothing unless module-first was explicitly requested', () => {
    const log = vi.fn();
    const blueprints = [blueprint('web', 'rewritten'), blueprint('admin', 'rewritten')];

    expect(migrateLegacyRepositoryCheckpoint(state, blueprints, {
      selectedConfig: true, options: { topology: 'layer-first', dryRun: true }, log,
    })).toEqual([]);

    expect(log).not.toHaveBeenCalled();

    expect(migrateLegacyRepositoryCheckpoint(state, blueprints, {
      selectedConfig: false, options: { topology: 'module-first', dryRun: true }, log,
    })).toEqual([]);

    expect(log).not.toHaveBeenCalled();
  });

  it('plans only rewritten legacy configs and reports every dry-run write', () => {
    const log = vi.fn();

    const actions = migrateLegacyRepositoryCheckpoint(state, [
      blueprint('web', 'rewritten'),
      blueprint('admin', 'rewritten'),
      blueprint('checkout', 'manual'),
      blueprint('storefront', null),
    ], { selectedConfig: true, options: { topology: 'module-first', dryRun: true }, log });

    expect(actions.filter((_, index) => index % 2 === 1)
      .map((action) => action.kind === 'write' ? action.path : action.kind)).toEqual([
      path.join('apps/web/blueprint.config.mjs'),
      path.join('apps/admin/blueprint.config.mjs'),
    ]);

    const writes = log.mock.calls.filter((_, index) => index % 2 === 1);

    expect(writes.map(([message]) => message)).toEqual([
      `  would write: ${path.join('apps/web/blueprint.config.mjs')} `
      + '(Blueprint 3.2 → 4.0 layer-first checkpoint)',
      `  would write: ${path.join('apps/admin/blueprint.config.mjs')} `
      + '(Blueprint 3.2 → 4.0 layer-first checkpoint)',
    ]);
  });

  it('uses the application root when no Git repository root exists', () => {
    const actions = migrateLegacyRepositoryCheckpoint(
      { ...state, repositoryRoot: undefined },
      [blueprint('web', 'rewritten')],
      { selectedConfig: true, options: { topology: 'module-first', dryRun: true }, log: vi.fn() },
    );

    expect(actions[1]).toMatchObject({ path: 'blueprint.config.mjs' });

    expect(actions[0]).toMatchObject({
      kind: 'write', content: original, path: expect.stringMatching(/^blueprint.config.mjs.pre-v4-[a-f0-9]{64}$/),
      note: expect.stringContaining('architecture.module.private has no 4.0 replacement'),
    });
  });
});

describe('legacyOutcome', () => {
  const selected = (legacySource: RepositoryBlueprint['legacySource'] | undefined) => ({
    blueprint: blueprint('web', null).blueprint,
    configSource: null,
    legacyConfig: legacySource !== undefined,
    ...(legacySource ? { legacySource } : {}),
  });

  it('reads every repository config when the module-first checkpoint applies', () => {
    expect(legacyOutcome(
      { state: { ...state, hasConfig: true }, options: { topology: 'module-first' } },
      {
        resolved: null,
        blueprints: [
          blueprint('web', 'rewritten'),
          blueprint('admin', 'manual'),
          blueprint('storefront', null),
        ],
      },
    )).toEqual({
      rewritten: 1,
      manual: [{ config: path.join('apps/admin/blueprint.config.mjs'), declarations }],
    });
  });

  it('reads only the selected config on the ordinary reconciliation path', () => {
    const blueprints = [blueprint('admin', 'manual')];
    const input = { state: { ...state, hasConfig: true }, options: {} };

    expect(legacyOutcome(input, {
      resolved: selected({ kind: 'rewritten', source: '' }), blueprints,
    })).toEqual({ rewritten: 1, manual: [] });

    expect(legacyOutcome(input, {
      resolved: selected({ kind: 'manual', declarations }), blueprints,
    })).toEqual({ rewritten: 0, manual: [{ config: 'blueprint.config.mjs', declarations }] });

    expect(legacyOutcome(
      { state: { ...state, hasConfig: false }, options: { topology: 'module-first' } },
      { resolved: selected({ kind: 'manual', declarations }), blueprints },
    )).toEqual({ rewritten: 0, manual: [{ config: 'blueprint.config.mjs', declarations }] });
  });

  it('reports nothing when no config is a 3.2 config', () => {
    expect(legacyOutcome({ state: { ...state, hasConfig: true }, options: {} }, {
      resolved: selected(undefined), blueprints: [],
    })).toBeNull();

    expect(legacyOutcome({ state, options: {} }, { resolved: null, blueprints: [] })).toBeNull();

    expect(legacyOutcome(
      { state: { ...state, hasConfig: true }, options: { topology: 'module-first' } },
      { resolved: selected({ kind: 'manual', declarations }), blueprints: [] },
    )).toBeNull();
  });
});
