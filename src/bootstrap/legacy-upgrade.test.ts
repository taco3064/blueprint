import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { RepositoryBlueprint, ProjectState } from '../project';
import { legacyUpgradeNote, migrateLegacyRepositoryCheckpoint } from './legacy-upgrade';

const state = {
  applicationRoot: '/repo/apps/web',
  repositoryRoot: '/repo',
} as ProjectState;

function blueprint(
  application: string,
  legacyConfig: boolean,
): RepositoryBlueprint {
  const architecture = { alias: '~app', layers: [{ name: 'pages', does: 'routes' }] };

  return {
    applicationRoot: path.join('/repo/apps', application),
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

    expect(actions.map((action) => action.kind === 'write' ? action.path : action.kind)).toEqual([
      path.join('apps/web/blueprint.config.mjs'),
      path.join('apps/admin/blueprint.config.mjs'),
    ]);

    expect(log.mock.calls.map(([message]) => message)).toEqual([
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

    expect(actions[0]).toMatchObject({ path: 'blueprint.config.mjs' });
  });
});
