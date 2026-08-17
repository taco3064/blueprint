import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { emitLint } from '../emit/lint';
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

    // This header said "NOT compared … that check is layer-scoped only" until the
    // same change that made it false: `expectedStructural` now goes through
    // `netPatterns`, which composes `netModulePatterns` — so doctor compares the
    // very column this line was telling the reader it could not see. Sending an
    // adopter to do print-config work doctor already did is the mild half; telling
    // them a green doctor leaves the module axis unverified is the inverse of the
    // false green this whole area exists to prevent.
    expect(output).toContain('Doctor\'s survival');
    expect(output).toContain('check DOES compare these');
    expect(output).not.toContain('that check is layer-scoped only');

    // …and the boundary is stated precisely rather than flipped wholesale: the
    // bare-entry `paths` half really is still invisible to it (`readPatternGroups`
    // skips a paths-only option), so print-config keeps a narrower job.
    expect(output).toContain('bare-entry half');
    expect(output).toContain('reads `patterns` only');
    expect(output).toContain('npx eslint --print-config');

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

/**
 * Defect 2 of the #371 follow-up: `layerBans` / `resolveStructural` used to derive
 * `packageRules` / `globalRules` from `architecture.layers` ALONE
 * (`derivePackageRules(architecture.layers)`, no module names), and filtered with
 * `!rule.allowedIn.includes(layer.name)` — the layer's own bare name only, never its
 * owning module. So a package/global/selfOnly declared ONLY on a module (stage 2's
 * own cascade, already live in `emitLint`) never showed up here: `rules --json`
 * reported `active: false` for a structural rule the emitted config actually carries,
 * and a layer nested inside the owning module still showed the owned thing as banned.
 *
 * `hooks` is the one shared layer, declared with no `owns` / `allowedImporters` of its
 * own, so every ownership fact below comes from the module axis alone — Combat owns
 * `axios` and `requestAnimationFrame`; Shell owns nothing; Lobby's allowedImporters
 * narrows to Combat, selfOnly. Both Combat and Shell keep the shared layers (neither
 * sets `layers: false`), so `hooks` is genuinely nested in two different modules —
 * exactly the case a single bare-layer-name row could not tell apart.
 */
describe('runRules · module-owned primitives cascade into the per-net views', () => {
  const moduleOwned: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      layers: [{ name: 'hooks', does: 'state' }],
      modules: [
        {
          name: 'Combat',
          does: 'the fight loop',
          owns: [{ package: 'axios' }, { global: 'requestAnimationFrame' }],
        },
        { name: 'Shell', does: 'app chrome' },
        {
          name: 'Lobby',
          does: 'matchmaking',
          layers: false,
          allowedImporters: [{ module: 'Combat', selfOnly: true }],
        },
      ],
    },
  };

  it('mirrors emitLint: module-only ownership and selfOnly are what it actually '
    + 'emits', () => {
    // Ground truth from the real emitter, independent of `rules.ts`'s own reading —
    // this is the same "never probe the bundle, but a test may" pin
    // `rules.structural.test.ts` already holds `resolveStructural` to.
    const emitted = new Set(
      emitLint(moduleOwned).flatMap((entry) => Object.keys(entry.rules ?? {})),
    );

    expect(emitted.has('no-restricted-syntax')).toBe(true);
    expect(emitted.has('no-restricted-globals')).toBe(true);
  });

  it('reports module-only selfOnly and global ownership as active, not falsely off '
    + '(AC — resolveStructural)', async () => {
    const lines: string[] = [];

    await runRules(repo(moduleOwned), { json: true, log: (m) => void lines.push(m) });

    const { structural } = JSON.parse(lines.join('')) as {
      structural: { rule: string; active: boolean }[];
    };

    const active = (rule: string) => structural.find((r) => r.rule === rule)?.active;

    // Before this fix: `layers` (just `hooks`, which declares neither `owns` nor
    // `allowedImporters`) was the only thing read, so both came back `false` here
    // while `emitLint` — proven above — was already emitting both.
    expect(active('no-restricted-syntax')).toBe(true);
    expect(active('no-restricted-globals')).toBe(true);
  });

  it('cascades ownership into the owning module\'s net, and leaves a sibling '
    + 'module\'s net banned (AC — layerBans)', async () => {
    const { bans } = await runRules(repo(moduleOwned), { log: () => {} });

    const inCombat = bans.find((entry) => entry.layer === 'hooks' && entry.module === 'Combat');
    const inShell = bans.find((entry) => entry.layer === 'hooks' && entry.module === 'Shell');

    // Two rows for the SAME bare layer name — one per module it is actually nested
    // in — because the cascade genuinely differs between them.
    expect(inCombat).toBeDefined();
    expect(inShell).toBeDefined();

    // Combat owns axios AND requestAnimationFrame — its own "hooks" net may use
    // both, so neither is banned there. This is the direction the old code could
    // never produce: `!rule.allowedIn.includes('hooks')` is true regardless of which
    // module "hooks" sits in, so it always showed both as banned.
    expect(inCombat?.packages).toEqual([]);
    expect(inCombat?.globals).toEqual([]);
    expect(inCombat).not.toHaveProperty('packagesNote');

    // Shell owns neither — its OWN "hooks" net stays banned from both, proving the
    // fix does not over-cascade (a module owning something must not un-ban it
    // everywhere, only inside itself and its own nested layers).
    expect(inShell?.packages).toEqual(['axios']);
    expect(inShell?.globals).toEqual(['requestAnimationFrame']);
    expect(inShell?.packagesNote).toContain('is not compared by doctor\'s survival check');
  });

  it('carries the module axis in the --json output alongside the module bans, not '
    + 'instead of them', async () => {
    const lines: string[] = [];

    await runRules(repo(moduleOwned), { json: true, log: (m) => void lines.push(m) });

    const parsed = JSON.parse(lines.join('')) as {
      bans: {
        layer: string | null;
        module: string | null;
        packages: string[];
        globals: string[];
      }[];
      modules: { module: string; forbidden: string[] }[];
    };

    // Keyed on BOTH axes: each module now contributes its own root-file row as
    // well as its layer rows, so matching on the module alone would silently
    // take whichever comes first.
    const combat = parsed.bans.find((b) => b.module === 'Combat' && b.layer === 'hooks');
    const shell = parsed.bans.find((b) => b.module === 'Shell' && b.layer === 'hooks');

    expect(combat).toMatchObject({ layer: 'hooks', packages: [], globals: [] });

    expect(shell).toMatchObject({
      layer: 'hooks',
      packages: ['axios'],
      globals: ['requestAnimationFrame'],
    });

    // `moduleBans.forbidden` was already correct before this fix (AC3) — this proves
    // the new per-net cascade sits ALONGSIDE it, not that it replaced the (already
    // working) module-flow section.
    expect(parsed.modules.find((m) => m.module === 'Combat')?.forbidden).toEqual([]);
  });

  it('prints the module-qualified row so two rows sharing a bare layer name stay '
    + 'distinguishable', async () => {
    const lines: string[] = [];

    await runRules(repo(moduleOwned), { log: (m) => void lines.push(m) });

    const output = lines.join('\n');

    expect(output).toContain('Combat/hooks');
    expect(output).toContain('Shell/hooks');

    expect(output).toContain(
      '  Combat/hooks   no-import: (none) · packages: (none) · globals: (none)',
    );

    expect(output).toContain(
      '  Shell/hooks    no-import: (none) · packages: axios · globals: requestAnimationFrame',
    );
  });
});

/**
 * The selfOnly half of the same defect, and the no-layer nets the per-net view was
 * still filtering out. All three shapes in one fixture: a layer-level `selfOnly`
 * (`contexts` ← `views`), a MODULE-level `selfOnly` (`Lobby` ← `Combat`), layered
 * modules (`Shell`, `Combat`) and a `layers: false` one (`Lobby`).
 *
 * Two things were wrong here. `layerBans`'s `selfOnly` built its selector from the
 * bare layer name (`selfOnlyReexportSelector(alias, 'contexts')` → `~app/contexts/`),
 * but inside a module the target really sits at `~app/Combat/contexts/` — so the
 * one string this column exists to be PASTED from (see `LayerBans.selfOnly`'s own
 * doc comment, and `wiring.ts`'s failure message naming `blueprint rules --json` as
 * where to get "the exact selfOnly selectors") matched nothing in a modular repo and
 * silently protected nothing. And module-level selfOnly was reported nowhere at all.
 *
 * Separately, `layerBans` filtered out every net with no layer, so a module's own
 * root files and the whole of a `layers: false` module — which carry real bans
 * (package/global cascade, and the same-module root restriction) — appeared in no
 * section of the catalog.
 */
const allShapes: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'views', does: 'pages' },
      {
        name: 'contexts',
        does: 'state seam',
        allowedImporters: [{ layer: 'views', selfOnly: true }],
      },
    ],
    modules: [
      { name: 'Shell', does: 'app chrome' },
      {
        name: 'Combat',
        does: 'the fight loop',
        owns: [{ package: 'axios' }, { global: 'requestAnimationFrame' }],
      },
      {
        name: 'Lobby',
        does: 'matchmaking',
        layers: false,
        allowedImporters: [{ module: 'Combat', selfOnly: true }],
      },
    ],
  },
};

/** Every selfOnly selector the REAL emitted config carries, across every entry. */
const emittedSelectors = (): Set<string> =>
  new Set(
    emitLint(allShapes)
      .flatMap((entry) => entry.rules?.['no-restricted-syntax'] as unknown[] ?? [])
      .filter((item) => typeof item === 'object' && item !== null)
      .map((item) => (item as { selector: string }).selector),
  );

describe('runRules · the selfOnly selectors a modular merge fold copies', () => {
  it('reports exactly the selectors emitLint emits — no extras, none missing, '
    + 'verbatim', async () => {
    // The anti-drift pin, and it has to hold in BOTH directions, because the two
    // failures it guards are different and only one of them is loud. An extra —
    // a selector reported that nothing emits — gets pasted into a hand-merged
    // config, where doctor compares TEXTUALLY, so a merely plausible selector
    // guards nothing. A missing one is the defect this suite exists for: a
    // `layers: false` module appeared in no section of the catalog at all, and a
    // fold copying what the catalog showed silently dropped its bans. Containment
    // alone would have stayed green through exactly that.
    const { bans } = await runRules(repo(allShapes), { log: () => {} });
    const emitted = emittedSelectors();

    const reported = new Set(
      bans.flatMap((ban) => ban.selfOnly.flatMap((entry) => entry.selectors)),
    );

    expect(reported.size).toBeGreaterThan(0);

    // Distinct selectors on both sides, not multiplicity: one ban rides every net
    // it covers — a module-axis selfOnly repeats across all three nets inside the
    // importing module — so both the catalog and the emitted config restate it,
    // and how many times is not the claim. Sorted arrays rather than set compare
    // so a failure names the selector that moved.
    expect([...reported].sort()).toEqual([...emitted].sort());
  });

  it('anchors a layer target on its OWN module, not the bare layer name', async () => {
    const { bans } = await runRules(repo(allShapes), { log: () => {} });

    const inCombat = bans.find((b) => b.module === 'Combat' && b.layer === 'views');
    const ban = inCombat?.selfOnly.find((entry) => entry.target === 'contexts');

    expect(ban).toBeDefined();

    // The bug, stated as the assertion: the real file lives at
    // `~app/Combat/contexts/…`, so a selector anchored on the bare layer name
    // guards a path this repo does not have.
    expect(ban?.selectors[0]).toContain('~app\\u002FCombat\\u002Fcontexts');
    expect(ban?.selectors[0]).not.toMatch(/\^~app\\u002Fcontexts/);

    // The paste form still survives being pasted, and the caveats still travel.
    expect(JSON.parse(ban?.jsLiteral[0] ?? '')).toBe(ban?.selectors[0]);
    expect(ban?.note).toContain('copy `jsLiteral`, not `selectors`');
  });

  it('reports a module-level selfOnly, with the selector that also matches the bare '
    + 'entry', async () => {
    const { bans } = await runRules(repo(allShapes), { log: () => {} });

    // Carried by every net inside the importing module — its own root files and
    // each layer nested in it — exactly as emitLint emits it.
    const root = bans.find((b) => b.module === 'Combat' && b.layer === null);
    const ban = root?.selfOnly.find((entry) => entry.target === 'Lobby');

    expect(ban).toBeDefined();

    // A module's public face IS its bare alias path, so the module-axis builder
    // matches that spelling too — `$`-anchored — not only one segment deeper.
    // The layer builder would emit only the deeper form and miss the re-export
    // that names the module itself.
    expect(ban?.selectors[0]).toContain('~app\\u002FLobby$');
    expect(ban?.selectors[0]).toContain('~app\\u002FLobby\\u002F');
  });
});

/**
 * The other half: `layerBans` filtered out every net with no layer, so a module's
 * own root files and the whole of a `layers: false` module — both of which carry
 * real bans (the package/global cascade, and the same-module root restriction that
 * its files be reached relatively rather than through the alias) — appeared in no
 * section of the catalog at all.
 */
describe('runRules · the nets that belong to no layer', () => {
  it('gives a module\'s own root files a row, and a `layers: false` module any row '
    + 'at all', async () => {
    const { bans } = await runRules(repo(allShapes), { log: () => {} });

    // A layered module's root-file group: real bans (it may not use another
    // module's owned package/global), and no layer-flow edge of its own.
    const shellRoot = bans.find((b) => b.module === 'Shell' && b.layer === null);

    expect(shellRoot).toMatchObject({
      layer: null,
      module: 'Shell',
      forbidden: [],
      packages: ['axios'],
      globals: ['requestAnimationFrame'],
    });

    // `layers: false` — one net standing for the whole module, and before this it
    // reached NO section of the catalog: `layerBans` filtered it out for having no
    // layer, and `moduleBans` carries `forbidden` only, so its barred axios and
    // requestAnimationFrame were reported nowhere at all.
    const lobby = bans.find((b) => b.module === 'Lobby');

    expect(lobby).toMatchObject({
      layer: null,
      module: 'Lobby',
      forbidden: [],
      packages: ['axios'],
      globals: ['requestAnimationFrame'],
    });

    // The owning module's own root files reach what it owns — the cascade, at the
    // one depth that has no layer to carry it.
    expect(bans.find((b) => b.module === 'Combat' && b.layer === null))
      .toMatchObject({ packages: [], globals: [] });
  });

  it('prints the no-layer rows, and says what a bare-module row is', async () => {
    const lines: string[] = [];

    await runRules(repo(allShapes), { log: (m) => void lines.push(m) });

    const output = lines.join('\n');

    // Same label doctor names a lost net by — one spelling across both outputs,
    // because doctor's own red sends the reader here for the text to restore.
    expect(output).toContain(
      '  Shell          no-import: (none) · packages: axios · globals: requestAnimationFrame',
    );

    expect(output).toContain(
      '  Lobby          no-import: (none) · packages: axios · globals: requestAnimationFrame',
    );

    // A bare module name in a table headed "Per-layer bans" is two truths without a
    // bridge unless the prose supplies one — including WHY its no-import is (none).
    expect(output).toContain('A row keyed by a bare module name is that module\'s own file group');
    expect(output).toContain('declares `layers: false`');
    expect(output).toContain('it sits at no');
  });

  it('says none of that under the flat structure', async () => {
    // The paragraph is gated on a row shape that only a modular blueprint produces —
    // an explanation of a row nobody has is the noise the `packages` caveat beside it
    // is gated for the same reason.
    const flat: Blueprint = {
      framework: 'react',
      architecture: {
        alias: '~app',
        layers: [
          { name: 'views', does: 'pages' },
          {
            name: 'contexts',
            does: 'state seam',
            allowedImporters: [{ layer: 'views', selfOnly: true }],
          },
        ],
      },
    };

    const lines: string[] = [];
    const { bans } = await runRules(repo(flat), { log: (m) => void lines.push(m) });

    // Every row is a bare layer, module null — the flat shape is untouched.
    expect(bans.every((ban) => ban.module === null && ban.layer !== null)).toBe(true);
    expect(lines.join('\n')).not.toContain('A row keyed by a bare module name');

    // And the flat selector stays bare — no module to anchor on, so the string an
    // existing flat adopter copies is byte-for-byte the one they copied before.
    const views = bans.find((ban) => ban.layer === 'views');

    expect(views?.selfOnly[0].selectors[0]).toContain('/^~app\\u002Fcontexts\\u002F/');
  });
});
