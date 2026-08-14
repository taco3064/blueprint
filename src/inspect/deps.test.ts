import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runDeps } from './deps';

let root: string;

const silent = () => {};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-deps-'));

  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'x', dependencies: { vue: '^3' } }),
  );
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
  writeSrc('services/api/api.ts', 'export const api = 1;');
  writeSrc('hooks/useCart/useCart.ts', 'import { api } from \'~app/services/api\';');
  writeSrc('containers/Cart/Cart.ts', 'import { useCart } from \'~app/hooks/useCart\';');
  writeSrc('pages/Home/Home.ts', 'import { useCart } from \'~app/hooks/useCart\';');
}

describe('runDeps · target', () => {
  it('answers blast radius for a module key, file path, or src-prefixed path', async () => {
    scaffold();

    for (const target of ['hooks/useCart', 'src/hooks/useCart/useCart.ts', './src/hooks/useCart']) {
      const { ok, modules } = await runDeps(root, { target, log: silent });

      expect(ok).toBe(true);
      expect(modules[0].module).toBe('hooks/useCart');
      expect(modules[0].importedBy).toEqual(['containers/Cart', 'pages/Home']);
      expect(modules[0].imports).toEqual(['services/api']);
    }
  });

  it('renders arrows in the text report and raw JSON with --json', async () => {
    scaffold();
    let output = '';

    await runDeps(root, { target: 'hooks/useCart', log: (m) => (output = m) });
    expect(output).toContain('← containers/Cart');
    expect(output).toContain('→ services/api');

    await runDeps(root, { target: 'hooks/useCart', json: true, log: (m) => (output = m) });
    expect(JSON.parse(output).module).toBe('hooks/useCart');
  });

  it('fails on an unknown module', async () => {
    scaffold();
    let output = '';

    const { ok } = await runDeps(root, { target: 'hooks/useGhost', log: (m) => (output = m) });

    expect(ok).toBe(false);
    expect(output).toContain('Unknown module "hooks/useGhost"');
  });
});

describe('runDeps · leaderboard', () => {
  it('sorts every module by fan-in, name-breaking ties', async () => {
    scaffold();
    let output = '';

    const { ok, modules } = await runDeps(root, { log: (m) => (output = m) });

    expect(ok).toBe(true);
    expect(modules[0].module).toBe('hooks/useCart'); // fan-in 2
    expect(modules[1].module).toBe('services/api'); // fan-in 1
    expect(modules.at(-1)?.importedBy).toEqual([]);
    expect(output).toContain('Blast radius');
    expect(output).toContain('2 ← hooks/useCart');
  });

  it('handles an empty project and JSON output', async () => {
    let output = '';

    const empty = await runDeps(root, { log: (m) => (output = m) });

    expect(empty.modules).toEqual([]);
    expect(output).toContain('No modules found');

    scaffold();
    await runDeps(root, { json: true, log: (m) => (output = m) });
    expect(Array.isArray(JSON.parse(output).modules)).toBe(true);
  });
});

describe('runDeps · test files are excluded from the graph', () => {
  it('does not count test importers in the blast radius', async () => {
    scaffold();
    writeSrc('pages/Home/Home.test.ts', 'import { useCart } from \'~app/hooks/useCart\';');

    const { modules } = await runDeps(root, { target: 'hooks/useCart', log: silent });

    // Still the two production importers — the test adds nothing.
    expect(modules[0].importedBy).toEqual(['containers/Cart', 'pages/Home']);
  });
});

describe('runDeps · folders outside the declared layers', () => {
  it('lists skipped folders on the leaderboard instead of silently ignoring them', async () => {
    scaffold();
    writeSrc('legacy/old.ts', 'export const old = 1;');
    let output = '';

    await runDeps(root, { log: (m) => (output = m) });
    expect(output).toContain('(not under a declared layer, invisible to deps: legacy/)');

    await runDeps(root, { json: true, log: (m) => (output = m) });
    expect(JSON.parse(output).skipped).toEqual(['legacy']);
  });

  it('points at the skipped folder when the target lives in one', async () => {
    scaffold();
    writeSrc('legacy/old.ts', 'export const old = 1;');
    let output = '';

    const { ok } = await runDeps(root, { target: 'legacy/old', log: (m) => (output = m) });

    expect(ok).toBe(false);
    expect(output).toContain('"legacy/" is not a declared layer');
  });
});

describe('runDeps · flat-layout layers answer at layer granularity', () => {
  const flatConfig = async () => ({
    framework: 'vue' as const,
    architecture: {
      alias: '~app',
      layers: [
        { name: 'pages', does: 'routes', layout: 'folder' as const, allowedImporters: [] },
        { name: 'features', does: 'feature modules', allowedImporters: ['pages'] },
      ],
    },
  });

  beforeEach(() => {
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// user config');
    writeSrc('features/feed.ts', 'export const feed = 1;');
    writeSrc('pages/Home/Home.ts', 'import { feed } from \'~app/features/feed\';');
  });

  it('collapses a deep target to the layer node and says so', async () => {
    let output = '';

    const { ok, modules } = await runDeps(root, {
      target: 'features/feed',
      loadConfig: flatConfig,
      log: (m) => (output = m),
    });

    expect(ok).toBe(true);
    expect(modules[0].module).toBe('features');
    expect(output).toContain('features (flat layer — answers at layer granularity)');
  });

  it('marks the flat layer on the leaderboard', async () => {
    let output = '';

    await runDeps(root, { loadConfig: flatConfig, log: (m) => (output = m) });

    expect(output).toContain('← features (flat layer)');
    expect(output).toContain('← pages/Home');

    // pages is folder-shaped, so its modules answer at module granularity.
    // Claiming the layer-granularity caveat here would tell the reader the
    // blast radius is wider than it is.
    expect(output).not.toContain('pages/Home (flat layer)');
  });
});

describe('runDeps · a hand-written config is validated on load', () => {
  beforeEach(() => {
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// user config');
    scaffold();
  });

  it('fails with a precise message instead of a deep undefined-property crash', async () => {
    // An empty entry — a layer that declares NEITHER key is valid since the
    // flat default became real (field issue #23).
    const invalid = async () =>
      ({
        architecture: { alias: '~app', layers: [{ name: 'pages', entry: '' }] },
      }) as never;

    await expect(runDeps(root, { loadConfig: invalid, log: silent })).rejects.toThrow(
      /blueprint\.config\.mjs: Layer "pages" has an empty entry/,
    );
  });

  it('fails when the config has no default export', async () => {
    const empty = async () => undefined as never;

    await expect(runDeps(root, { loadConfig: empty, log: silent })).rejects.toThrow(
      'blueprint.config.mjs: missing default export.',
    );
  });
});

describe('runDeps · file modules drop their extension from the key', () => {
  it('resolves a bare-file module without its extension', async () => {
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'x', dependencies: { vue: '^3' } }),
    );

    writeSrc('components/HelloWorld.vue', '');
    writeSrc('pages/Home/Home.ts', 'import x from \'~app/components/HelloWorld.vue\';');

    const { ok, modules } = await runDeps(root, { target: 'components/HelloWorld', log: silent });

    expect(ok).toBe(true);
    expect(modules[0].module).toBe('components/HelloWorld');
    expect(modules[0].importedBy).toEqual(['pages/Home']);
  });
});

describe('runDeps · the order and shape of what it reports', () => {
  it('returns no modules at all for an unknown target', async () => {
    writeSrc('services/api/api.ts', 'export const api = 1;');

    const { ok, modules } = await runDeps(root, { target: 'hooks/useGhost', log: silent });

    // The caller reads `modules` whatever `ok` says. A placeholder row there is
    // a module that does not exist, presented as blast radius.
    expect(ok).toBe(false);
    expect(modules).toEqual([]);
  });

  it('sorts both edge lists, and reports an empty one as empty', async () => {
    // Written deliberately out of alphabetical order: `zed` first, and it
    // imports nothing. Two importers reaching one module is what makes the
    // importer sort observable at all.
    writeSrc('services/zed/index.ts', 'export const z = 1;');
    writeSrc('services/beta/index.ts', 'export const b = 1;');
    writeSrc('hooks/useX/index.ts', 'import { z } from \'~app/services/zed\';\nimport { b } from \'~app/services/beta\';');
    writeSrc('hooks/useA/index.ts', 'import { z } from \'~app/services/zed\';');

    const { modules } = await runDeps(root, { log: silent });
    const zed = modules.find((entry) => entry.module === 'services/zed');
    const useX = modules.find((entry) => entry.module === 'hooks/useX');

    // zed is imported by both hooks, alphabetically whatever order they landed in.
    expect(zed?.importedBy).toEqual(['hooks/useA', 'hooks/useX']);

    // And zed imports nothing — an empty list, not a placeholder.
    expect(zed?.imports).toEqual([]);

    // useX reaches both services, also sorted.
    expect(useX?.imports).toEqual(['services/beta', 'services/zed']);
  });

  it('never reads a src-root file as a skipped folder, and sorts the ones it finds', async () => {
    // `src/main.ts` is entry wiring with one path segment — it is not a folder
    // outside the layers, and naming it as one sends the reader looking for a
    // directory that is not there. The two real ones come back sorted.
    scaffold();
    writeSrc('main.ts', 'export const boot = 1;');
    writeSrc('zutils/helper.ts', 'export const h = 1;');
    writeSrc('atools/helper.ts', 'export const h = 1;');

    let output = '';

    await runDeps(root, { log: (m) => (output = m) });

    expect(output).toContain('invisible to deps: atools/, zutils/');
    expect(output).not.toContain('main.ts');
  });
});

describe('runDeps · normalizing the target the user typed', () => {
  it('drops empty path segments a pasted path carries', async () => {
    scaffold();

    // A doubled slash survives a copy-paste, and an empty segment becomes part
    // of the module key — the answer is then "unknown module" for a module that
    // is sitting right there.
    const { ok, modules } = await runDeps(root, { target: 'hooks//useCart', log: silent });

    expect(ok).toBe(true);
    expect(modules[0].module).toBe('hooks/useCart');
  });

  it('does not call a multi-segment key a flat layer, even when every layer is flat', async () => {
    // With `layout: 'flat'` as the SHARED shape, `layoutOf` answers flat for any
    // name — including one that is not a layer at all. The single-segment and
    // is-a-layer checks are what stop `pages/Home` from claiming the
    // layer-granularity caveat.
    const sharedFlat = async () => ({
      framework: 'vue' as const,
      architecture: {
        alias: '~app',
        // Every layer but `pages` is flat, and `layoutOf` answers "flat" for any
        // name it does not recognise as a layer — including a `layer/Module` key.
        layers: [
          { name: 'pages', does: 'routes', layout: 'folder' as const, allowedImporters: [] },
          { name: 'services', does: 'io', allowedImporters: ['pages'] },
        ],
      },
    });

    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// user config');
    writeSrc('services/api.ts', 'export const api = 1;');
    writeSrc('pages/Home/Home.ts', 'import { api } from \'~app/services/api\';');

    let output = '';

    await runDeps(root, { loadConfig: sharedFlat, log: (m) => (output = m) });

    // services is flat and collapses to the layer node. pages is folder-shaped,
    // so its key is `pages/Home` — and `layoutOf` answers "flat" for that key too,
    // since it is not a layer name. Only the single-segment and is-a-layer checks
    // keep the caveat off it.
    expect(output).toContain('services (flat layer)');
    expect(output).not.toContain('pages/Home (flat layer)');
  });
});

describe('runDeps · a layer node is not automatically a flat layer', () => {
  it('withholds the flat-layer caveat from a folder-shaped layer', async () => {
    // Importing the layer itself (`~app/services`, not a module inside it) makes
    // a single-segment node carrying the layer's own name. Both remaining guards
    // on the caveat matter right there: the name IS a layer, so only the layout
    // decides. Claiming layer granularity for a folder-shaped layer tells the
    // reader the blast radius covers the whole layer when it covers one module.
    writeSrc('services/api/api.ts', 'export const api = 1;');
    writeSrc('hooks/useCart/useCart.ts', 'import all from \'~app/services\';');

    let output = '';

    await runDeps(root, { log: (m) => (output = m) });

    expect(output).toMatch(/← services$/m);
    expect(output).not.toContain('(flat layer)');
  });
});

describe('runDeps · the leaderboard closes on its last row', () => {
  it('puts nothing that could read as a row between the table and its footer', async () => {
    // Anything landing directly under the table reads as one more module — one with
    // no imported-by count in front of it, so the reader cannot tell a row from a
    // footnote. Two things may follow it and both are set off: the skipped-folder
    // note (absent here) and the derivation, after a blank line. Asserted by
    // position rather than as `endsWith`, so a stray line in that slot still fails
    // now that the output legitimately continues past the last row.
    scaffold();

    let output = '';

    await runDeps(root, { log: (m) => (output = m) });

    const lines = output.split('\n');
    const lastRow = lines.findIndex((line) => line.includes('← pages/Home'));

    expect(lines[lastRow + 1]).toBe('');
    expect(lines[lastRow + 2]).toContain('How this graph was read');
    expect(output).not.toContain('invisible to deps');
  });
});

describe('runDeps · the blast-radius list is ordered by key, not by scan order', () => {
  it('sorts importers whose key order differs from the directory listing', async () => {
    // A file module drops its extension from the key, so `use.ts` becomes
    // `hooks/use` — which sorts BEFORE `hooks/use-x`, while the directory
    // listing puts `use-x/` first (`-` precedes `.`). Reporting scan order there
    // hands the blast radius over to however the filesystem enumerates, and the
    // same repo answers differently on two machines.
    writeSrc('services/api/api.ts', 'export const api = 1;');
    writeSrc('hooks/use-x/use-x.ts', 'import { api } from \'~app/services/api\';');
    writeSrc('hooks/use.ts', 'import { api } from \'~app/services/api\';');

    const { modules } = await runDeps(root, { log: silent });

    expect(modules.find((entry) => entry.module === 'services/api')?.importedBy)
      .toEqual(['hooks/use', 'hooks/use-x']);
  });
});

describe('runDeps · the logger it uses when the caller supplies none', () => {
  it('writes the report to the console instead of dropping it', async () => {
    // deps carries no writer of its own — the CLI relies on this default. A
    // no-op in its place makes the command print nothing at all while still
    // returning ok, which reads as "this repo has no modules".
    scaffold();

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runDeps(root, {});

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Blast radius'));
    spy.mockRestore();
  });
});

describe('runDeps · two meanings of "module"', () => {
  /** A modular repo: Fighter and Combat both hold a `useInput` unit. */
  function modular(): void {
    fs.writeFileSync(
      path.join(root, 'blueprint.config.mjs'),
      `export default ${JSON.stringify({
        framework: 'react',
        architecture: {
          alias: '~app',
          modules: [
            { name: 'app', does: 'routing', layers: false, imports: ['Fighter'] },
            { name: 'Fighter', does: 'the ship', imports: ['Combat'] },
            { name: 'Combat', does: 'bullets' },
            { name: 'Loadout', does: 'points nobody spends yet' },
          ],
          layers: [{ name: 'hooks', does: 'state', layout: 'folder' }],
        },
      })};\n`,
    );

    writeSrc('Combat/index.ts', 'export const attack = 1;');
    writeSrc('Combat/hooks/useInput/useInput.ts', 'export const useInput = 1;');
    writeSrc('Fighter/hooks/useInput/useInput.ts', 'import { attack } from \'~app/Combat\';');
    writeSrc('Fighter/hooks/useLives/useLives.ts', 'import { u } from \'~app/Fighter/hooks/useInput\';');
    writeSrc('Fighter/index.ts', 'export const Fighter = 1;');
    writeSrc('app/routes/Game.ts', 'import { F } from \'~app/Fighter\';');
    writeSrc('Loadout/hooks/usePoints/usePoints.ts', 'export const p = 1;');
  }

  it('keeps two modules\' same-named units apart in the graph', async () => {
    modular();

    const { units } = await runDeps(root, { log: silent });

    expect(units.map((entry) => entry.unit).sort()).toContain('Fighter/hooks/useInput');
    expect(units.map((entry) => entry.unit).sort()).toContain('Combat/hooks/useInput');
  });

  it('answers a bare module name at feature granularity', async () => {
    modular();

    const lines: string[] = [];
    const { modules, units } = await runDeps(root, { target: 'Fighter', log: (m) => void lines.push(m) });

    expect(units).toEqual([]);
    expect(modules[0].module).toBe('Fighter');
    // `app` reaches Fighter through its entry; Fighter reaches Combat.
    expect(modules[0].importedBy).toEqual(['app']);
    expect(modules[0].imports).toEqual(['Combat']);
  });

  it('answers a unit path at unit granularity, bounded by its module', async () => {
    modular();

    const lines: string[] = [];

    const { units } = await runDeps(root, {
      target: 'Fighter/hooks/useInput',
      log: (m) => void lines.push(m),
    });

    expect(units[0].unit).toBe('Fighter/hooks/useInput');
    expect(units[0].importedBy).toEqual(['Fighter/hooks/useLives']);
    expect(units[0].module).toBe('Fighter');
    // The second line: the radius the unit's own list stops at.
    expect(units[0].moduleImportedBy).toEqual(['app']);

    const text = lines.join('\n');

    expect(text).toContain('Every importer above is inside "Fighter"');
    expect(text).toContain('"Fighter" is imported by (1): app');
  });

  it('says so when a unit\'s module is imported by nothing', async () => {
    modular();

    const lines: string[] = [];

    const { units } = await runDeps(root, {
      target: 'Loadout/hooks/usePoints',
      log: (m) => void lines.push(m),
    });

    expect(units[0].moduleImportedBy).toEqual([]);
    expect(lines.join('\n')).toContain('imported by nothing — this unit\'s radius ends here');
  });

  it('prints both rankings, labelled, and never one silently', async () => {
    modular();

    const lines: string[] = [];

    await runDeps(root, { log: (m) => void lines.push(m) });

    const text = lines.join('\n');

    expect(text).toContain('Blast radius per module (imported-by count):');
    expect(text).toContain('Blast radius per unit (inside its own module — imported-by count):');
  });

  it('carries both lists under --json, and the inner one is `unit`', async () => {
    modular();

    const lines: string[] = [];

    await runDeps(root, { json: true, log: (m) => void lines.push(m) });

    const parsed = JSON.parse(lines.join('\n')) as {
      modules: { module: string }[];
      units: { unit: string; module: string }[];
    };

    expect(parsed.modules.some((entry) => entry.module === 'Fighter')).toBe(true);
    expect(parsed.units.some((entry) => entry.unit === 'Fighter/hooks/useInput')).toBe(true);
    // The rename is the point: no key holds both meanings.
    expect(JSON.stringify(parsed.units)).not.toContain('"module":"Fighter/hooks');
  });

  it('never labels a feature module a flat layer', async () => {
    // `layoutOf` answers `flat` for any name it does not know, and every module
    // name is one — so the layer test in `isFlatLayer` is load-bearing now that
    // the graph builds single-segment keys that are not layer names.
    modular();

    const lines: string[] = [];

    await runDeps(root, { log: (m) => void lines.push(m) });

    expect(lines.join('\n')).not.toContain('(flat layer)');
  });

  it('reports a folder outside the declared MODULES as skipped', async () => {
    modular();
    writeSrc('Achievements/hooks/useBadge/useBadge.ts', 'export const b = 1;');

    const lines: string[] = [];

    await runDeps(root, { log: (m) => void lines.push(m) });

    expect(lines.join('\n')).toContain('Achievements/');
  });
});
