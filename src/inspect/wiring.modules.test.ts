import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

import { defineBlueprint } from '../config';
import { emitLint } from '../emit/lint';
import { netSelfBanPaths, resolveBanScope } from '../emit/lint/bans';
import type { ScanResult } from './types';
import { expectedStructural, wiringCheck } from './wiring';

/**
 * The module-axis proof for `wiringCheck` — Defect 1 of the #371 follow-up:
 * before this fix, `pickProbes` iterated `architecture.layers` alone, so every
 * probe it built (`resolveLayerFiles('hooks', ...)`) matched no real file under
 * a modular blueprint at all (real files sit at `src/Combat/hooks/**`), and a
 * merge that dropped a module-scoped ban went completely unprobed. This spreads
 * `emitLint`'s OWN real output through the real `eslint` package — the same
 * `calculateConfigForFile` doctor itself calls — so both proofs below exercise
 * the genuine merge-survival mechanism, not a hand-rolled stand-in for it.
 *
 * Same Shell / Combat / Lobby fixture `lint.modules.test.ts` uses (Shell ↔
 * Combat the declared-order edge, Lobby the narrowed one, Combat layered,
 * Lobby holding its files directly) — reusing it keeps the module-axis shape
 * this ticket already proved correct in the emitter as the one doctor is
 * asked to agree with.
 */
const blueprint = defineBlueprint({
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'hooks', does: 'state' },
      { name: 'components', does: 'ui' },
    ],
    modules: [
      { name: 'Shell', does: 'app chrome' },
      { name: 'Combat', does: 'the fight loop', owns: [{ global: 'requestAnimationFrame' }] },
      {
        name: 'Lobby',
        does: 'matchmaking',
        layers: false,
        allowedImporters: [{ module: 'Combat', selfOnly: true }],
      },
    ],
  },
});

const scanOf = (...paths: string[]): ScanResult => ({
  topDirs: [],
  files: paths.map((p) => ({ path: p, segments: p.split('/').slice(1), imports: [] })),
});

// One real file per net emitLint governs — module root, and each layer nested
// inside a module that keeps them — so every probe lands on a real path rather
// than falling back to a synthetic one.
const scan = scanOf(
  'src/Shell/Shell.tsx',
  'src/Shell/hooks/useShell.ts',
  'src/Shell/components/Header.tsx',
  'src/Combat/Combat.tsx',
  'src/Combat/hooks/useCombat.ts',
  'src/Combat/components/Fighter.tsx',
  'src/Lobby/Lobby.tsx',
);

/** Load a real `eslint`, resolving `overrideConfig` through the real package doctor calls. */
function loaderFor(config: unknown[]) {
  return async (): Promise<unknown> => ({
    ESLint: class {
      private readonly real = new ESLint({
        cwd: process.cwd(),
        overrideConfigFile: true,
        overrideConfig: config as ESLint.Options['overrideConfig'],
      });

      async calculateConfigForFile(filePath: string): Promise<unknown> {
        return this.real.calculateConfigForFile(filePath);
      }
    },
  });
}

const run = (config: unknown[]) =>
  wiringCheck({
    root: process.cwd(),
    blueprint,
    scanResult: scan,
    wired: true,
    merged: true,
    hasTypescript: true,
    load: loaderFor(config),
  });

describe('wiringCheck · a modular blueprint (module-axis bans, #371 follow-up)', () => {
  it('passes when emitLint\'s own real output is spread untouched', async () => {
    const check = await run([...emitLint(blueprint)]);

    expect(check.ok).toBe(true);
  });

  it('probes reach every net, not only bare layer names', () => {
    // The bug this closes, made directly visible: `expectedStructural` used to
    // take a bare layer name and could not even be ASKED about a module net.
    // Every net this blueprint governs must produce a real expectation —
    // module root files (no layer) and a layer nested inside a module alike.
    const nets: { module: string | null; layer: string | null }[] = [
      { module: 'Shell', layer: null },
      { module: 'Shell', layer: 'hooks' },
      { module: 'Combat', layer: null },
      { module: 'Combat', layer: 'hooks' },
      { module: 'Lobby', layer: null },
    ];

    for (const net of nets) {
      const expected = expectedStructural(blueprint, net);

      expect(expected.groups.size).toBeGreaterThan(0);
    }

    // Combat's own root files: forbidden from Shell (upstream), entry-only into
    // Lobby (downstream, allowed) — the module-flow ban this check now covers.
    const combatRoot = expectedStructural(blueprint, { module: 'Combat', layer: null });

    expect([...combatRoot.groups].some((g) => g.includes('~app/Shell'))).toBe(true);
    expect([...combatRoot.groups].some((g) => g.includes('~app/Lobby/**'))).toBe(true);

    // Lobby's allowedImporters narrows to Combat, selfOnly — the module-axis
    // selfOnly selector, not the layer one `netSelfOnly` alone would find.
    expect(combatRoot.selectors.size).toBeGreaterThan(0);
  });

  it('catches a merge that silently drops a module-scoped ban', async () => {
    // The exact failure mode `SCOPE` / `pickProbes` describe: a later flat-config
    // entry whose `files` overlaps Combat's own root files REPLACES emitLint's
    // `no-restricted-imports` there instead of merging into it (flat config never
    // merges) — dropping the module-flow ban ("Combat" may not import "Shell",
    // and may reach "Lobby" only at its entry) while every layer net, and every
    // OTHER rule on this same net, stays intact and lint stays green.
    const config = [
      ...emitLint(blueprint),
      {
        files: ['src/Combat/*.{js,jsx,ts,tsx}'],
        rules: { 'no-restricted-imports': ['error', { paths: ['left-pad'] }] },
      },
    ];

    const check = await run(config);

    expect(check.ok).toBe(false);
    // Named by the net it was lost from — the module's own root files, not a
    // bare layer name (there is none to name; this net has no layer at all).
    expect(check.detail).toContain('Combat: no-restricted-imports lost');
    expect(check.detail).toContain('structural pattern group(s)');
    // Nothing else on this same probe was touched — the loss names exactly
    // what the merge actually dropped, not every rule on the net.
    expect(check.detail).not.toContain('Combat: no-restricted-syntax');
    expect(check.detail).not.toContain('Combat: no-restricted-globals');
    expect(check.detail).not.toContain('Combat: blueprint/relative-escape');
    // Every other net's bans survived — the red is scoped to the one net a
    // later entry actually replaced, not the whole modular config.
    expect(check.detail).not.toContain('Shell:');
    expect(check.detail).not.toContain('Lobby:');
  });

  it('compares the cross-module flow ban itself — what `rules`\' per-module header '
    + 'claims', () => {
    // The header of `rules`' Per-module bans section states outright that doctor
    // compares that column. This is that claim as an assertion against the code
    // behind it, so the two cannot drift apart the way they just did: the header
    // went on saying "NOT compared — layer-scoped only" after `expectedStructural`
    // started routing through `netPatterns` (which composes `netModulePatterns`).
    //
    // Keyed on the exact group `buildModulePatterns` emits for a forbidden module:
    // both spellings, because the bare alias path IS the module's entry.
    const combatRoot = expectedStructural(blueprint, { module: 'Combat', layer: null });
    const groups = [...combatRoot.groups].map((group) => JSON.parse(group) as string[]);

    expect(groups).toContainEqual(['~app/Shell', '~app/Shell/**']);

    // And the same ban reaches every net INSIDE the module, which is why the
    // header can promise a merge that drops it reddens somewhere.
    const combatLayer = expectedStructural(blueprint, { module: 'Combat', layer: 'hooks' });

    expect([...combatLayer.groups].map((group) => JSON.parse(group) as string[]))
      .toContainEqual(['~app/Shell', '~app/Shell/**']);
  });

  it('does NOT compare the same-module bare-entry ban — the header\'s one caveat', () => {
    // The other half of the header's claim, and the reason it is a narrowed
    // boundary rather than a flipped polarity. `buildModuleSelfBan` emits the
    // module's own alias spelling as an exact `paths` entry; `netPatterns` returns
    // only the `patterns` half, and `readPatternGroups` skips a paths-only option
    // outright. So `~app/Combat` is genuinely invisible to this check, and the
    // header still sends that one to `--print-config`.
    const scope = resolveBanScope(blueprint);
    const net = { module: 'Combat', layer: null };

    // It really is emitted — the caveat is about what doctor reads, not about a
    // ban that does not exist.
    expect(netSelfBanPaths(net, scope).map((entry) => entry.name)).toContain('~app/Combat');

    // …and it really is absent from what doctor compares.
    const flattened = [...expectedStructural(blueprint, net).groups].join(' ');

    expect(flattened).not.toContain('"~app/Combat"');
  });
});
