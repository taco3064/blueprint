import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RepositoryBlueprint, ProjectState } from '../project';
import { legacyUpgradeNote, migrateLegacyRepositoryCheckpoint } from './legacy-upgrade';

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

function blueprint(
  application: string,
  legacyConfig: boolean,
): RepositoryBlueprint {
  const architecture = { alias: '~app', layers: [{ name: 'pages', does: 'routes' }] };

  return {
    applicationRoot: path.join(repository, 'apps', application),
    architecture,
    blueprint: { framework: 'react', architecture },
    legacyConfig,
    migratedConfigSource: legacyConfig ? `export default { name: '${application}' };\n` : null,
    topology: 'layer-first',
  };
}

describe('legacy repository checkpoint', () => {
  it('describes single-app and repository-wide phase-one scope precisely', () => {
    expect(legacyUpgradeNote({ topology: 'module-first' }, 1))
      .toContain('migrated the config to valid 4.0 layer-first');

    expect(legacyUpgradeNote({ topology: 'module-first' }, 2))
      .toContain('migrated all 2 Blueprint configs in the repository');

    expect(legacyUpgradeNote({ topology: 'module-first', dryRun: true }, 2))
      .toContain('would migrate all 2 Blueprint configs in the repository');
  });

  it('does nothing unless module-first was explicitly requested', () => {
    const log = vi.fn();
    const blueprints = [blueprint('web', true), blueprint('admin', true)];

    expect(migrateLegacyRepositoryCheckpoint(state, blueprints, {
      selectedConfig: true, options: { topology: 'layer-first', dryRun: true }, log,
    })).toEqual([]);

    expect(log).not.toHaveBeenCalled();

    expect(migrateLegacyRepositoryCheckpoint(state, blueprints, {
      selectedConfig: false, options: { topology: 'module-first', dryRun: true }, log,
    })).toEqual([]);

    expect(log).not.toHaveBeenCalled();
  });

  it('plans only legacy configs and reports every dry-run write', () => {
    const log = vi.fn();

    const actions = migrateLegacyRepositoryCheckpoint(state, [
      blueprint('web', true),
      blueprint('admin', true),
      blueprint('storefront', false),
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
      [blueprint('web', true)],
      { selectedConfig: true, options: { topology: 'module-first', dryRun: true }, log: vi.fn() },
    );

    expect(actions[1]).toMatchObject({ path: 'blueprint.config.mjs' });

    expect(actions[0]).toMatchObject({
      kind: 'write', content: original, path: expect.stringMatching(/^blueprint.config.mjs.pre-v4-[a-f0-9]{64}$/),
      note: expect.stringContaining('architecture.module.private has no 4.0 replacement'),
    });
  });
});
