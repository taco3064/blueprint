import { describe, expect, it } from 'vitest';
import type { ArchitectureDef } from '../config';
import {
  buildModuleGraph,
  entryResolver,
  graphKey,
  layoutResolver,
  modularVerdict,
  targetModuleKey,
} from './resolve';
import type { ImportRef, ScanResult, ScannedFile } from './types';

const architecture: ArchitectureDef = {
  alias: '~app',
  folder: { layout: 'folder', entry: 'index' },
  layers: [
    { name: 'components', does: 'UI' },
    { name: 'hooks', does: 'state' },
  ],
};

const layoutOf = layoutResolver(architecture);
const entryOf = entryResolver(architecture);
const isLayer = (name: string): boolean => architecture.layers.some((l) => l.name === name);
const shape = { layoutOf, entryOf, isLayer, layered: true };

/** The same architecture, read from inside a module that declared `layers: false`. */
const unlayered = { ...shape, layered: false };

describe('modularVerdict · a module root file', () => {
  it('imports anything inside its own module, unconstrained — no layer boundary to cross', () => {
    // A root file is in no layer, so relativeVerdict's folder-shape check never runs.
    expect(modularVerdict(['Combat', 'Combat.tsx'], ['Combat', 'hooks', 'useCombat.ts'], shape))
      .toBe('ok');

    expect(modularVerdict(['Combat', 'Combat.tsx'], ['Combat', 'components', 'Fighter.ts'], shape))
      .toBe('ok');

    // Even reaching past a folder-layout sibling's entry — root imports inner freely.
    expect(modularVerdict(
      ['Combat', 'Combat.tsx'],
      ['Combat', 'components', 'internal', 'deep.ts'],
      shape,
    )).toBe('ok');
  });
});

describe('modularVerdict · a module holding its files directly (layers: false)', () => {
  it('treats every file as root — no layer to cross for any relative target', () => {
    expect(modularVerdict(['Lobby', 'a.ts'], ['Lobby', 'b.ts'], unlayered)).toBe('ok');
    expect(modularVerdict(['Lobby', 'a.ts'], ['Lobby', 'sub', 'c.ts'], unlayered)).toBe('ok');
  });

  it('reads a folder that shares a declared layer\'s name as a folder', () => {
    // The layer names are architecture-wide, so `hooks` and `components` exist
    // as names whatever a module declares — and a module holding its files
    // directly is free to use them for ordinary folders. Judged against the
    // global names, this pair is "leaves this layer — use the alias", while the
    // same module's self-ban forbids that alias: a file with no legal way to
    // import its own neighbour. `layered` is the whole difference, which is why
    // the same call is asserted both ways here.
    expect(modularVerdict(
      ['Lobby', 'components', 'Seat.ts'],
      ['Lobby', 'hooks'],
      unlayered,
    )).toBe('ok');

    expect(modularVerdict(
      ['Lobby', 'components', 'Seat.ts'],
      ['Lobby', 'hooks'],
      shape,
    )).toBe('leaves-layer');
  });

  it('still holds the module boundary and the source root around it', () => {
    // One governance scope, not no governance: the module is still the edge.
    expect(modularVerdict(['Lobby', 'components', 'Seat.ts'], ['Combat', 'index.ts'], unlayered))
      .toBe('leaves-module');

    expect(modularVerdict(['Lobby', 'components', 'Seat.ts'], null, unlayered))
      .toBe('escapes-src');
  });
});

describe('modularVerdict · an inner layer reaching back to its own module root', () => {
  it('is caught as leaves-layer — hand-traced: Combat/hooks/useCombat.ts importing '
    + '../Combat.tsx', () => {
    expect(modularVerdict(
      ['Combat', 'hooks', 'useCombat.ts'],
      ['Combat', 'Combat.tsx'],
      shape,
    )).toBe('leaves-layer');
  });
});

describe('modularVerdict · an inner layer staying inside itself, or reaching a sibling', () => {
  it('delegates to relativeVerdict once the module segment is stripped from both sides', () => {
    // Same layer, same module: ok (relativeVerdict's own "stays inside" case).
    expect(modularVerdict(
      ['Combat', 'hooks', 'useCombat.ts'],
      ['Combat', 'hooks', 'useOther.ts'],
      shape,
    )).toBe('ok');

    // Reaching a DIFFERENT declared layer inside the SAME module leaves that layer —
    // relativeVerdict's own verdict, unaware modules exist at all.
    expect(modularVerdict(
      ['Combat', 'hooks', 'useCombat.ts'],
      ['Combat', 'components', 'Fighter.ts'],
      shape,
    )).toBe('leaves-layer');
  });
});

describe('modularVerdict · another module', () => {
  it('is leaves-module whatever it points at — another module is reachable only at its '
    + 'entry, through the alias', () => {
    expect(modularVerdict(['Combat', 'hooks', 'useCombat.ts'], ['Lobby', 'Lobby.tsx'], shape))
      .toBe('leaves-module');

    expect(modularVerdict(['Combat', 'Combat.tsx'], ['Lobby'], shape)).toBe('leaves-module');
  });
});

describe('modularVerdict · unresolvable targets', () => {
  it('reports escapes-src for a target that climbed past the root', () => {
    expect(modularVerdict(['Combat', 'Combat.tsx'], null, shape)).toBe('escapes-src');
  });
});

/**
 * AC10: `moduleKey` and `buildModuleGraph` gain the module dimension in their
 * segment arithmetic — module at `segments[0]` when modular, layer at
 * `segments[1]`, a folder-layout feature-folder at `segments[2]`. Without this,
 * `buildModuleGraph`'s old flat-only filter (`layerNames.includes(segments[0])`)
 * drops every file on a modular repo, and `blueprint deps` silently reports an
 * empty leaderboard — worse than an error, because nothing signals the run
 * went wrong.
 */
const COMBAT = { name: 'Combat', does: 'the fight loop' };
const LOBBY = { name: 'Lobby', does: 'matchmaking', layers: false as const };

describe('graphKey · the module dimension composed on top of moduleKey', () => {
  it('is moduleKey unchanged when no modules are declared', () => {
    expect(graphKey(['hooks', 'useCombat', 'useCombat.ts'], { modules: [], isLayer, layoutOf }))
      .toBe('hooks/useCombat');
  });

  it('collapses a module\'s own root file to the bare module name', () => {
    // A root file has exactly one inner segment — the file itself, and
    // 'Combat.tsx' names no declared layer — the same reason a flat layer's
    // own direct file collapses to the bare layer name in `moduleKey`.
    expect(graphKey(['Combat', 'Combat.tsx'], { modules: [COMBAT], isLayer, layoutOf }))
      .toBe('Combat');
  });

  it('composes module/layer/feature-folder for a folder-layout layer nested inside one', () => {
    expect(
      graphKey(
        ['Combat', 'hooks', 'useCombat', 'useCombat.ts'],
        { modules: [COMBAT], isLayer, layoutOf },
      ),
    ).toBe('Combat/hooks/useCombat');
  });

  it('composes module/layer for a BARE cross-layer entry reach — one inner segment '
    + 'that IS a declared layer', () => {
    // The regression this covers: one inner segment is ALSO what a real root file
    // looks like (`['Combat.tsx']` above), so segment count alone cannot tell them
    // apart — `~app/Combat/hooks` (AC2's own paired example, importing a layer's
    // own entry without naming a file inside it) strips to `inner = ['hooks']`,
    // identical in length to a root file's inner segments. Collapsing both to the
    // bare module name folded a real cross-layer edge and a real root-entry reach
    // into the same graph node. `isLayer('hooks')` is what tells them apart:
    // `moduleKey(['hooks'], layoutOf)` already answers 'hooks' via its own
    // single-segment short-circuit, so composing through it costs nothing extra.
    expect(graphKey(['Combat', 'hooks'], { modules: [COMBAT], isLayer, layoutOf }))
      .toBe('Combat/hooks');

    // Contrast with the collapsing case right above it: the ONLY difference is
    // whether the one inner segment names a declared layer.
    expect(graphKey(['Combat', 'Combat.tsx'], { modules: [COMBAT], isLayer, layoutOf }))
      .toBe('Combat');
  });

  it('collapses every file of a layers: false module to the bare module name', () => {
    // No declared layer can ever sit inside it, so unlike a layered module's
    // root file (an isLayer check), this collapses regardless of depth or
    // content — the same "one net for the whole thing" nets.ts's `moduleNets`
    // builds for it. Even a segment that WOULD be a declared layer name if this
    // were a layered module (`hooks`) still collapses — `layers: false` wins.
    expect(graphKey(['Lobby', 'sub', 'deep.ts'], { modules: [LOBBY], isLayer, layoutOf }))
      .toBe('Lobby');

    expect(graphKey(['Lobby', 'hooks'], { modules: [LOBBY], isLayer, layoutOf })).toBe('Lobby');
  });

  it('falls through to moduleKey for a segment naming no declared module', () => {
    // Ungoverned input is moduleKey's call, not graphKey's — the caller (
    // buildModuleGraph / targetModuleKey) decides whether to use the answer at
    // all. moduleKey's own answer, unchanged: the shared folder layout is
    // 'folder' in this fixture's architecture, so an unrecognised name still
    // reads as folder-shaped and keys one segment deeper.
    expect(graphKey(['legacy', 'old.ts'], { modules: [COMBAT], isLayer, layoutOf }))
      .toBe('legacy/old');
  });
});

describe('targetModuleKey · the module dimension, both import shapes', () => {
  const file = (segments: string[]): ScannedFile => ({
    path: segments.join('/'),
    segments,
    imports: [],
  });

  const ref = (specifier: string): ImportRef => ({ specifier, names: [], isExport: false });
  const modules = [COMBAT, LOBBY];

  it('resolves a bare module-entry alias import to the module node', () => {
    expect(
      targetModuleKey(
        ref('~app/Lobby'),
        file(['Combat', 'Combat.tsx']),
        { aliases: ['~app'], isLayer, modules, layoutOf },
      ),
    ).toBe('Lobby');
  });

  it('resolves an alias import reaching a declared layer inside another module', () => {
    expect(
      targetModuleKey(
        ref('~app/Combat/hooks/useCombat'),
        file(['Lobby', 'Matchmaker.tsx']),
        { aliases: ['~app'], isLayer, modules, layoutOf },
      ),
    ).toBe('Combat/hooks/useCombat');
  });

  it('resolves a BARE alias import to a layer\'s own entry, distinct from the module root', () => {
    // The same regression, through the public alias-import entry point: `~app/
    // Combat/hooks` (no file after the layer) must not collapse to the same key
    // as `~app/Combat` (the module's own bare entry).
    expect(
      targetModuleKey(
        ref('~app/Combat/hooks'),
        file(['Lobby', 'Matchmaker.tsx']),
        { aliases: ['~app'], isLayer, modules, layoutOf },
      ),
    ).toBe('Combat/hooks');

    expect(
      targetModuleKey(
        ref('~app/Combat'),
        file(['Lobby', 'Matchmaker.tsx']),
        { aliases: ['~app'], isLayer, modules, layoutOf },
      ),
    ).toBe('Combat');
  });

  it('answers null for an alias path naming no declared module', () => {
    expect(
      targetModuleKey(
        ref('~app/legacy'),
        file(['Combat', 'Combat.tsx']),
        { aliases: ['~app'], isLayer, modules, layoutOf },
      ),
    ).toBeNull();
  });

  it('resolves a relative import reaching another module\'s file', () => {
    expect(
      targetModuleKey(
        ref('../../Lobby/Matchmaker'),
        file(['Combat', 'hooks', 'useCombat.ts']),
        { aliases: ['~app'], isLayer, modules, layoutOf },
      ),
    ).toBe('Lobby');
  });
});

describe('buildModuleGraph · a modular repo', () => {
  const modular: ArchitectureDef = {
    ...architecture,
    modules: [
      { name: 'Combat', does: 'the fight loop' },
      { name: 'Lobby', does: 'matchmaking', layers: false },
    ],
  };

  const file = (segments: string[], imports: Partial<ImportRef>[] = []): ScannedFile => ({
    path: ['src', ...segments].join('/'),
    segments,
    imports: imports.map((ref) => ({ specifier: '', names: [], isExport: false, ...ref })),
  });

  it('builds module-level nodes, not an empty graph — segments[0] is a module, not a layer', () => {
    const scan: ScanResult = {
      topDirs: ['Combat', 'Lobby'],
      files: [
        file(['Combat', 'Combat.tsx'], [{ specifier: './hooks/useCombat' }]),
        file(['Combat', 'hooks', 'useCombat.ts'], [{ specifier: '~app/Lobby' }]),
        file(['Lobby', 'Matchmaker.tsx']),
      ],
    };

    const graph = buildModuleGraph(scan, modular);

    // Not the empty leaderboard the unmodified filter (layerNames.includes(
    // segments[0])) would produce — every module name it drops on a real
    // modular repo appears here instead.
    expect(graph.modules).toEqual(new Set(['Combat', 'Combat/hooks/useCombat', 'Lobby']));
    expect(graph.edges.get('Combat')).toEqual(new Set(['Combat/hooks/useCombat']));
    expect(graph.edges.get('Combat/hooks/useCombat')).toEqual(new Set(['Lobby']));
  });

  it('keeps a bare cross-layer entry reach and a genuine module-root reach as '
    + 'distinct edges', () => {
    // The regression: `graphKey`'s old `inner.length <= 1` collapse could not
    // tell a bare cross-layer entry reach (`~app/Combat/hooks`, one inner
    // segment that IS a declared layer) apart from a genuine root reach
    // (`~app/Combat`, or a real root file — also one inner segment, or none).
    // Both used to fold into the single node 'Combat', hiding one edge and
    // misattributing the other. Hand-count: Combat/components -> Combat/hooks
    // (same-module, bare layer entry) and Lobby -> Combat (cross-module, the
    // module's own root) are two DIFFERENT destinations.
    //
    // Flat layers here (no `folder` override), deliberately unlike `modular`
    // above — under a folder-layout layer a real file composes one segment
    // deeper still (`Combat/components/Fighter`), which is its own, already
    // proven, established behavior and would only add noise to this one.
    const flatModular: ArchitectureDef = {
      alias: '~app',
      layers: [{ name: 'hooks', does: 'state' }, { name: 'components', does: 'ui' }],
      modules: [COMBAT, LOBBY],
    };

    const scan: ScanResult = {
      topDirs: ['Combat', 'Lobby'],
      files: [
        file(['Combat', 'components', 'Fighter.tsx'], [{ specifier: '~app/Combat/hooks' }]),
        file(['Combat', 'hooks', 'useCombat.ts']),
        file(['Lobby', 'Matchmaker.tsx'], [{ specifier: '~app/Combat' }]),
      ],
    };

    const graph = buildModuleGraph(scan, flatModular);

    expect(graph.modules).toEqual(new Set(['Combat/components', 'Combat/hooks', 'Lobby']));
    expect(graph.edges.get('Combat/components')).toEqual(new Set(['Combat/hooks']));
    expect(graph.edges.get('Lobby')).toEqual(new Set(['Combat']));
    expect(graph.edges.get('Combat/hooks')).toBeUndefined();
  });

  it('drops a folder naming no declared module, the same as an undeclared layer does flat', () => {
    const scan: ScanResult = {
      topDirs: ['Combat', 'legacy'],
      files: [
        file(['Combat', 'Combat.tsx']),
        file(['legacy', 'old.ts']),
      ],
    };

    expect(buildModuleGraph(scan, modular).modules).toEqual(new Set(['Combat']));
  });
});
