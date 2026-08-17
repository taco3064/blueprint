import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { runRules } from './rules';
import type { Blueprint } from '../config';

/**
 * AC3 (as it applies to `rules`): before this stage, `blueprint rules` called
 * `getForbiddenLayers` only — it had no module-axis section at all, so an
 * adopter reading the catalog had no way to learn a cross-module import was
 * banned, even though `emitLint` (since stage 2) was already enforcing it.
 * `moduleBans` closes that gap with `getForbiddenModules`, the module-axis
 * twin `config/modules.ts` already exports — the same primitive
 * `emit/lint/bans.ts`'s `netModulePatterns` reads.
 */
const dirs: string[] = [];

function repo(config?: Blueprint): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-rules-modules-'));

  dirs.push(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }));

  if (config) {
    fs.writeFileSync(
      path.join(dir, 'blueprint.config.mjs'),
      `export default ${JSON.stringify(config)};\n`,
    );
  }

  return dir;
}

afterEach(() => {
  while (dirs.length) {
    fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
  }
});

const blueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [{ name: 'hooks', does: 'state' }],
    modules: [
      { name: 'Shell', does: 'app chrome' },
      { name: 'Combat', does: 'the fight loop' },
      {
        name: 'Lobby',
        does: 'matchmaking',
        layers: false,
        allowedImporters: [{ module: 'Combat', selfOnly: true }],
      },
    ],
  },
};

describe('runRules · the per-module ban rows', () => {
  it('resolves per-module bans from the same primitive emitLint uses', async () => {
    const { modules } = await runRules(repo(blueprint), { log: () => {} });

    // Shell (declared first): Combat allows it by the default order rule;
    // Lobby narrows its own allowedImporters to Combat only, excluding Shell —
    // the exact "order alone would allow it, the narrowing excludes it" shape
    // `lint.modules.test.ts`'s AC3 case proves against the real emitted config.
    expect(modules.find((entry) => entry.module === 'Shell')).toEqual({
      module: 'Shell',
      forbidden: ['Lobby'],
    });

    // Combat (declared second): reaching Shell is upstream — forbidden by the
    // one-way flow, the same "declared order implies default permission"
    // direction the layer axis already has (`lint.modules.test.ts`'s own AC3:
    // "Combat reaching Shell is upstream, not permitted"). Lobby explicitly
    // allows Combat, so that one is not forbidden.
    expect(modules.find((entry) => entry.module === 'Combat')).toEqual({
      module: 'Combat',
      forbidden: ['Shell'],
    });

    // Lobby (declared last): nothing is declared after it, so by the default
    // rule alone it may import nothing — both Shell and Combat are upstream.
    expect(modules.find((entry) => entry.module === 'Lobby')).toEqual({
      module: 'Lobby',
      forbidden: ['Shell', 'Combat'],
    });
  });

  it('prints the per-module bans section in the text catalog', async () => {
    const lines: string[] = [];

    await runRules(repo(blueprint), { log: (m) => void lines.push(m) });

    const output = lines.join('\n');

    expect(output).toContain('Per-module bans');
    expect(output).toContain('NOT compared');
    expect(output).toContain('doctor\'s survival check');
    expect(output).toContain('  Shell          no-import: Lobby');
    expect(output).toContain('  Combat         no-import: Shell');
    expect(output).toContain('  Lobby          no-import: Shell, Combat');

    // The module section is what closes the report now, on a modular blueprint.
    expect(output.endsWith('  Lobby          no-import: Shell, Combat')).toBe(true);
  });

  it('carries modules in the --json output too', async () => {
    const lines: string[] = [];

    await runRules(repo(blueprint), { json: true, log: (m) => void lines.push(m) });

    type Parsed = { modules: { module: string; forbidden: string[] }[] };
    const parsed = JSON.parse(lines.join('')) as Parsed;

    expect(parsed.modules).toEqual([
      { module: 'Shell', forbidden: ['Lobby'] },
      { module: 'Combat', forbidden: ['Shell'] },
      { module: 'Lobby', forbidden: ['Shell', 'Combat'] },
    ]);
  });

  it('reports no module section under the flat structure — no architecture.modules', async () => {
    const flat: Blueprint = {
      framework: 'react',
      architecture: { alias: '~app', layers: [{ name: 'hooks', does: 'state' }] },
    };

    const { modules } = await runRules(repo(flat), { log: () => {} });

    expect(modules).toEqual([]);

    const lines: string[] = [];

    await runRules(repo(flat), { log: (m) => void lines.push(m) });

    expect(lines.join('\n')).not.toContain('Per-module bans');
  });

  it('reports no module section at all without a config', async () => {
    const { modules } = await runRules(repo(), { log: () => {} });

    expect(modules).toEqual([]);
  });

  it('prints "(none)" for a module the default order rule forbids nothing to', async () => {
    // Two modules, neither narrowing allowedImporters: B (declared second)
    // allows A by the default rule, so A's own forbidden list is empty.
    const twoModules: Blueprint = {
      framework: 'react',
      architecture: {
        alias: '~app',
        layers: [{ name: 'hooks', does: 'state' }],
        modules: [
          { name: 'A', does: 'first' },
          { name: 'B', does: 'second' },
        ],
      },
    };

    const { modules } = await runRules(repo(twoModules), { log: () => {} });

    expect(modules).toEqual([
      { module: 'A', forbidden: [] },
      { module: 'B', forbidden: ['A'] },
    ]);

    const lines: string[] = [];

    await runRules(repo(twoModules), { log: (m) => void lines.push(m) });

    expect(lines.join('\n')).toContain('  A              no-import: (none)');
  });
});
