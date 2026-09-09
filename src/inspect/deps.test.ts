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

const moduleConfig = {
  framework: 'react' as const,
  architecture: {
    alias: '~app',
    modules: [{ name: 'auth', does: 'authentication' }],
    layers: [
      { name: 'components', does: 'UI', layout: 'folder' as const },
      { name: 'services', does: 'I/O', layout: 'folder' as const },
    ],
  },
};

describe('runDeps · target', () => {
  it('answers a module-first unit target with its full identity', async () => {
    writeSrc('auth/services/api/index.ts', 'export const api = 1;');
    writeSrc('auth/components/Login/index.ts', 'import { api } from "~app/auth/services/api";');

    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// test config');

    const result = await runDeps(root, {
      target: 'auth/services/api',
      log: silent,
      loadConfig: async () => moduleConfig,
    });

    expect(result.ok).toBe(true);
    expect(result.units[0].unit).toBe('auth/services/api');
    expect(result.units[0].importedBy).toEqual(['auth/components/Login']);
  });

  it('names undeclared module and inner-layer folders as outside the graph', async () => {
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// test config');

    writeSrc('auth/random/x.ts', 'export const x = 1;');
    writeSrc('legacy/x.ts', 'export const x = 1;');
    writeSrc('root.ts', 'export const root = 1;');
    let output = '';

    await runDeps(root, {
      json: true,
      log: (message) => (output = message),
      loadConfig: async () => moduleConfig,
    });

    expect(JSON.parse(output).skipped).toEqual(['auth/random', 'legacy']);

    const outside = await runDeps(root, {
      target: 'auth/random/x',
      log: (message) => (output = message),
      loadConfig: async () => moduleConfig,
    });

    expect(outside.ok).toBe(false);
    expect(output).toContain('"auth/random/" is outside the declared architecture');

    await runDeps(root, {
      target: 'auth/random',
      log: (message) => (output = message),
      loadConfig: async () => moduleConfig,
    });

    expect(output).toContain('"auth/random/" is outside the declared architecture');
  });

  it('answers blast radius for a unit key, file path, or src-prefixed path', async () => {
    scaffold();

    for (const target of ['hooks/useCart', 'src/hooks/useCart/useCart.ts', './src/hooks/useCart']) {
      const { ok, units } = await runDeps(root, { target, log: silent });

      expect(ok).toBe(true);
      expect(units[0].unit).toBe('hooks/useCart');
      expect(units[0].importedBy).toEqual(['containers/Cart', 'pages/Home']);
      expect(units[0].imports).toEqual(['services/api']);
    }
  });

  it.each([
    ['lib/app', 'lib/app/hooks/useCart/useCart.ts'],
    ['.', 'hooks/useCart/useCart.ts'],
  ])('accepts a file target under sourceRoot %s', async (sourceRoot, target) => {
    const rooted = {
      framework: 'vue' as const,
      architecture: {
        alias: '~app',
        sourceRoot,
        layers: [
          { name: 'hooks', does: 'state', layout: 'folder' as const },
          { name: 'services', does: 'network', layout: 'folder' as const },
        ],
      },
    };

    const write = (rel: string, content: string) => {
      const full = path.join(root, sourceRoot, rel);

      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    };

    write('services/api/index.ts', 'export const api = 1;');
    write('hooks/useCart/index.ts', 'import { api } from "~app/services/api";');
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// test config');

    const result = await runDeps(root, {
      target,
      log: silent,
      loadConfig: async () => rooted,
    });

    expect(result.ok).toBe(true);
    expect(result.units[0].unit).toBe('hooks/useCart');
  });

  it('renders arrows in the text report and raw JSON with --json', async () => {
    scaffold();
    let output = '';

    await runDeps(root, { target: 'hooks/useCart', log: (m) => (output = m) });
    expect(output).toContain('← containers/Cart');
    expect(output).toContain('→ services/api');

    await runDeps(root, { target: 'hooks/useCart', json: true, log: (m) => (output = m) });
    expect(JSON.parse(output).unit).toBe('hooks/useCart');
  });

  it('fails on an unknown unit', async () => {
    scaffold();
    let output = '';

    const { ok } = await runDeps(root, { target: 'hooks/useGhost', log: (m) => (output = m) });

    expect(ok).toBe(false);
    expect(output).toContain('Unknown unit "hooks/useGhost"');
  });
});

describe('runDeps · leaderboard', () => {
  it('sorts every unit by fan-in, name-breaking ties', async () => {
    scaffold();
    let output = '';

    const { ok, units } = await runDeps(root, { log: (m) => (output = m) });

    expect(ok).toBe(true);
    expect(units[0].unit).toBe('hooks/useCart'); // fan-in 2
    expect(units[1].unit).toBe('services/api'); // fan-in 1
    expect(units.at(-1)?.importedBy).toEqual([]);
    expect(output).toContain('Blast radius');
    expect(output).toContain('2 ← hooks/useCart');
  });

  it('handles an empty project and JSON output', async () => {
    let output = '';

    const empty = await runDeps(root, { log: (m) => (output = m) });

    expect(empty.units).toEqual([]);
    expect(output).toContain('No units found');

    scaffold();
    await runDeps(root, { json: true, log: (m) => (output = m) });
    expect(Array.isArray(JSON.parse(output).units)).toBe(true);
  });
});

describe('runDeps · test files are excluded from the graph', () => {
  it('does not count test importers in the blast radius', async () => {
    scaffold();
    writeSrc('pages/Home/Home.test.ts', 'import { useCart } from \'~app/hooks/useCart\';');

    const { units } = await runDeps(root, { target: 'hooks/useCart', log: silent });

    // Still the two production importers — the test adds nothing.
    expect(units[0].importedBy).toEqual(['containers/Cart', 'pages/Home']);
  });
});

describe('runDeps · folders outside the declared layers', () => {
  it('lists skipped folders on the leaderboard instead of silently ignoring them', async () => {
    scaffold();
    writeSrc('legacy/old.ts', 'export const old = 1;');
    let output = '';

    await runDeps(root, { log: (m) => (output = m) });
    expect(output).toContain('(outside the declared architecture, invisible to deps: legacy/)');

    await runDeps(root, { json: true, log: (m) => (output = m) });
    expect(JSON.parse(output).skipped).toEqual(['legacy']);
  });

  it('points at the skipped folder when the target lives in one', async () => {
    scaffold();
    writeSrc('legacy/old.ts', 'export const old = 1;');
    let output = '';

    const { ok } = await runDeps(root, { target: 'legacy/old', log: (m) => (output = m) });

    expect(ok).toBe(false);
    expect(output).toContain('"legacy/" is outside the declared architecture');
  });
});

describe('runDeps · file-layout layers preserve layer granularity', () => {
  const fileConfig = async () => ({
    framework: 'vue' as const,
    architecture: {
      alias: '~app',
      layers: [
        { name: 'pages', does: 'routes', layout: 'folder' as const, allowedImporters: [] },
        {
          name: 'features',
          does: 'feature units',
          layout: 'file' as const,
          allowedImporters: ['pages'],
        },
      ],
    },
  });

  beforeEach(() => {
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// user config');
    writeSrc('features/feed.ts', 'export const feed = 1;');
    writeSrc('pages/Home/Home.ts', 'import { feed } from \'~app/features/feed\';');
  });

  it('collapses a direct file target to the layer node and says so', async () => {
    let output = '';

    const { ok, units } = await runDeps(root, {
      target: 'features/feed',
      loadConfig: fileConfig,
      log: (m) => (output = m),
    });

    expect(ok).toBe(true);
    expect(units[0].unit).toBe('features');
    expect(output).toContain('features (file-layout layer — answers at layer granularity)');
  });

  it('marks the file-layout layer on the leaderboard', async () => {
    let output = '';

    await runDeps(root, { loadConfig: fileConfig, log: (m) => (output = m) });

    expect(output).toContain('← features (file-layout layer)');
    expect(output).toContain('← pages/Home');

    // pages is folder-shaped, so its units answer at unit granularity.
    // Claiming the layer-granularity caveat here would tell the reader the
    // blast radius is wider than it is.
    expect(output).not.toContain('pages/Home (file-layout layer)');
  });
});

describe('runDeps · a hand-written config is validated on load', () => {
  beforeEach(() => {
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// user config');
    scaffold();
  });

  it('fails with a precise message instead of a deep undefined-property crash', async () => {
    // An empty entry — a MISSING module is valid since the flat default
    // became real (field issue #23).
    const invalid = async () =>
      ({
        architecture: { alias: '~app', layers: [{ name: 'pages' }], module: { entry: '' } },
      }) as never;

    await expect(runDeps(root, { loadConfig: invalid, log: silent })).rejects.toThrow(
      /blueprint\.config\.mjs: architecture\.module/,
    );
  });

  it('fails when the config has no default export', async () => {
    const empty = async () => undefined as never;

    await expect(runDeps(root, { loadConfig: empty, log: silent })).rejects.toThrow(
      'blueprint.config.mjs: missing default export.',
    );
  });
});

describe('runDeps · file units drop their extension from the key', () => {
  it('resolves a bare-file unit without its extension', async () => {
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'x', dependencies: { vue: '^3' } }),
    );

    writeSrc('components/HelloWorld.vue', '');
    writeSrc('pages/Home/Home.ts', 'import x from \'~app/components/HelloWorld.vue\';');

    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// user config');

    const config = async () => ({
      framework: 'vue' as const,
      architecture: {
        alias: '~app',
        layers: [
          { name: 'components', does: 'ui', layout: 'file' as const },
          { name: 'pages', does: 'routes', layout: 'folder' as const },
        ],
      },
    });

    const { ok, units } = await runDeps(root, {
      target: 'components/HelloWorld', loadConfig: config, log: silent,
    });

    expect(ok).toBe(true);
    expect(units[0].unit).toBe('components');
    expect(units[0].importedBy).toEqual(['pages/Home']);
  });
});

describe('runDeps · the order and shape of what it reports', () => {
  it('returns no units at all for an unknown target', async () => {
    writeSrc('services/api/api.ts', 'export const api = 1;');

    const { ok, units } = await runDeps(root, { target: 'hooks/useGhost', log: silent });

    // The caller reads `units` whatever `ok` says. A placeholder row there is
    // a unit that does not exist, presented as blast radius.
    expect(ok).toBe(false);
    expect(units).toEqual([]);
  });

  it('sorts both edge lists, and reports an empty one as empty', async () => {
    // Written deliberately out of alphabetical order: `zed` first, and it
    // imports nothing. Two importers reaching one unit is what makes the
    // importer sort observable at all.
    writeSrc('services/zed/index.ts', 'export const z = 1;');
    writeSrc('services/beta/index.ts', 'export const b = 1;');

    writeSrc(
      'hooks/useX/index.ts',
      'import { z } from \'~app/services/zed\';\nimport { b } from \'~app/services/beta\';',
    );

    writeSrc('hooks/useA/index.ts', 'import { z } from \'~app/services/zed\';');

    const { units } = await runDeps(root, { log: silent });
    const zed = units.find((entry) => entry.unit === 'services/zed');
    const useX = units.find((entry) => entry.unit === 'hooks/useX');

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
    // of the unit key — the answer is then "unknown unit" for a unit that
    // is sitting right there.
    const { ok, units } = await runDeps(root, { target: 'hooks//useCart', log: silent });

    expect(ok).toBe(true);
    expect(units[0].unit).toBe('hooks/useCart');
  });

  it('does not call a multi-segment folder-unit key a file-layout layer', async () => {
    const mixedLayout = async () => ({
      framework: 'vue' as const,
      architecture: {
        alias: '~app',
        layers: [
          {
            name: 'pages',
            does: 'routes',
            layout: 'folder' as const,
            allowedImporters: [],
          },
          { name: 'services', does: 'io', layout: 'file' as const, allowedImporters: ['pages'] },
        ],
      },
    });

    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// user config');
    writeSrc('services/api.ts', 'export const api = 1;');
    writeSrc('pages/Home/Home.ts', 'import { api } from \'~app/services/api\';');

    let output = '';

    await runDeps(root, { loadConfig: mixedLayout, log: (m) => (output = m) });

    // services is file-shaped and collapses to the layer node; pages/Home does not.
    expect(output).toContain('services (file-layout layer)');
    expect(output).not.toContain('pages/Home (file-layout layer)');
  });
});

describe('runDeps · a layer node is not automatically a file-layout layer', () => {
  it('withholds the file-layout caveat from a folder-shaped layer', async () => {
    // Importing the layer itself (`~app/services`, not a unit inside it) makes
    // a single-segment node carrying the layer's own name. Both remaining guards
    // on the caveat matter right there: the name IS a layer, so only the layout
    // decides. Claiming layer granularity for a folder-shaped layer tells the
    // reader the blast radius covers the whole layer when it covers one unit.
    writeSrc('services/api/api.ts', 'export const api = 1;');
    writeSrc('hooks/useCart/useCart.ts', 'import all from \'~app/services\';');

    let output = '';

    await runDeps(root, { log: (m) => (output = m) });

    expect(output).toMatch(/← services$/m);
    expect(output).not.toContain('(file-layout layer)');
  });
});

describe('runDeps · the leaderboard closes on its last row', () => {
  it('puts nothing that could read as a row between the table and its footer', async () => {
    // Anything landing directly under the table reads as one more unit — one with
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
    // A file unit drops its extension from the key, so `use.ts` becomes
    // `hooks/use` — which sorts BEFORE `hooks/use-x`, while the directory
    // listing puts `use-x/` first (`-` precedes `.`). Reporting scan order there
    // hands the blast radius over to however the filesystem enumerates, and the
    // same repo answers differently on two machines.
    writeSrc('services/api/api.ts', 'export const api = 1;');
    writeSrc('hooks/use-x/use-x.ts', 'import { api } from \'~app/services/api\';');
    writeSrc('hooks/use.ts', 'import { api } from \'~app/services/api\';');

    const { units } = await runDeps(root, { log: silent });

    expect(units.find((entry) => entry.unit === 'services/api')?.importedBy)
      .toEqual(['hooks/use', 'hooks/use-x']);
  });
});

describe('runDeps · the logger it uses when the caller supplies none', () => {
  it('writes the report to the console instead of dropping it', async () => {
    // deps carries no writer of its own — the CLI relies on this default. A
    // no-op in its place makes the command print nothing at all while still
    // returning ok, which reads as "this repo has no units".
    scaffold();

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runDeps(root, {});

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Blast radius'));
    spy.mockRestore();
  });
});
