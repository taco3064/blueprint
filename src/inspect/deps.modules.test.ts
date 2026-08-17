import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runDeps } from './deps';

/**
 * AC10: `blueprint deps` on a modular fixture with a known fan-in/fan-out shape
 * between two modules reports a non-empty module list whose edges match that
 * shape by hand-count — not the empty leaderboard the unmodified `moduleKey` /
 * `buildModuleGraph` segment arithmetic would produce today (`segments[0]` is a
 * module name, never a declared layer, so the old flat-only filter dropped
 * every file).
 *
 * Flat layout throughout (no `architecture.folder` override, matching
 * `lint.modules.test.ts`'s own Combat/Lobby fixture) — a layer's own files
 * collapse to the layer node, so `hooks` / `components` key at `Combat/hooks`
 * / `Combat/components` regardless of the file name inside them. The fixture,
 * by hand-count:
 * - `Combat/Combat.tsx` (module root) relatively imports its own inner layer
 *   (`./hooks/useCombat`) — an intra-module edge, `Combat` → `Combat/hooks`.
 * - `Combat/hooks/useCombat.ts` and `Combat/components/Fighter.tsx` both
 *   alias-import `~app/Lobby` — a `layers: false` module, one node — so
 *   `Lobby`'s fan-in is 2.
 * - `Lobby/Matchmaker.tsx` imports nothing.
 */
let root: string;

const silent = () => {};

const modularConfig = async () => ({
  framework: 'react' as const,
  architecture: {
    alias: '~app',
    layers: [
      { name: 'hooks', does: 'state' },
      { name: 'components', does: 'ui' },
    ],
    modules: [
      { name: 'Combat', does: 'the fight loop' },
      { name: 'Lobby', does: 'matchmaking', layers: false as const },
    ],
  },
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-deps-modules-'));

  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x' }));
  fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// user config');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeSrc(rel: string, content = ''): void {
  const full = path.join(root, 'src', rel);

  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function scaffold(): void {
  writeSrc('Combat/Combat.tsx', 'import { useCombat } from \'./hooks/useCombat\';');
  writeSrc('Combat/hooks/useCombat.ts', 'import { Lobby } from \'~app/Lobby\';');
  writeSrc('Combat/components/Fighter.tsx', 'import { Lobby } from \'~app/Lobby\';');
  writeSrc('Lobby/Matchmaker.tsx', 'export const Matchmaker = 1;');
}

describe('runDeps · a modular fixture is not the empty leaderboard', () => {
  it('reports every module-level node, not zero — the old bug\'s exact shape', async () => {
    scaffold();

    const { ok, modules } = await runDeps(root, { loadConfig: modularConfig, log: silent });

    expect(ok).toBe(true);
    expect(modules).not.toEqual([]);

    expect(modules.map((entry) => entry.module).sort()).toEqual([
      'Combat',
      'Combat/components',
      'Combat/hooks',
      'Lobby',
    ]);
  });

  it('matches the fan-in/fan-out shape by hand-count', async () => {
    scaffold();

    const { modules } = await runDeps(root, { loadConfig: modularConfig, log: silent });
    const byKey = new Map(modules.map((entry) => [entry.module, entry]));

    // Lobby: imported by both Combat layers that alias-import it, nothing itself.
    expect(byKey.get('Lobby')).toMatchObject({
      importedBy: ['Combat/components', 'Combat/hooks'],
      imports: [],
    });

    // Combat/hooks: imported by the module's own root file (the relative
    // edge), imports Lobby.
    expect(byKey.get('Combat/hooks')).toMatchObject({
      importedBy: ['Combat'],
      imports: ['Lobby'],
    });

    // Combat (the module root): imports its own hooks layer, imported by nobody.
    expect(byKey.get('Combat')).toMatchObject({ importedBy: [], imports: ['Combat/hooks'] });
  });

  it('sorts the leaderboard with the module carrying the most fan-in first', async () => {
    scaffold();
    let output = '';

    const { modules } = await runDeps(root, {
      loadConfig: modularConfig,
      log: (m) => (output = m),
    });

    expect(modules[0].module).toBe('Lobby'); // fan-in 2, the highest
    expect(output).toContain('2 ← Lobby');
  });

  it('answers a targeted query for a module-root node', async () => {
    scaffold();
    let output = '';

    const { ok, modules } = await runDeps(root, {
      target: 'Combat',
      loadConfig: modularConfig,
      log: (m) => (output = m),
    });

    expect(ok).toBe(true);
    expect(modules[0].imports).toEqual(['Combat/hooks']);
    expect(output).toContain('→ Combat/hooks');
  });

  it('answers a targeted query for a layers: false module by its bare name', async () => {
    scaffold();

    const { ok, modules } = await runDeps(root, {
      target: 'Lobby',
      loadConfig: modularConfig,
      log: silent,
    });

    expect(ok).toBe(true);
    expect(modules[0].importedBy).toEqual(['Combat/components', 'Combat/hooks']);
  });

  it('normalizes a src-prefixed target the same way under a modular blueprint', async () => {
    scaffold();

    const { ok, modules } = await runDeps(root, {
      target: 'src/Combat/hooks/useCombat.ts',
      loadConfig: modularConfig,
      log: silent,
    });

    expect(ok).toBe(true);
    expect(modules[0].module).toBe('Combat/hooks');
  });

  it('names "module", not "layer", in the unknown-target and empty-graph copy', async () => {
    scaffold();
    let output = '';

    const { ok } = await runDeps(root, {
      target: 'Ghost',
      loadConfig: modularConfig,
      log: (m) => (output = m),
    });

    expect(ok).toBe(false);
    expect(output).toContain('Unknown module "Ghost"');

    writeSrc('legacy/old.ts', 'export const old = 1;');
    let leaderboard = '';

    await runDeps(root, { loadConfig: modularConfig, log: (m) => (leaderboard = m) });

    expect(leaderboard).toContain('not under a declared module, invisible to deps: legacy/');

    const { ok: skippedOk, modules: skippedModules } = await runDeps(root, {
      target: 'legacy/old',
      loadConfig: modularConfig,
      log: silent,
    });

    expect(skippedOk).toBe(false);
    expect(skippedModules).toEqual([]);
  });
});
