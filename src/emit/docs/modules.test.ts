import { describe, expect, it } from 'vitest';

import { featureRoot, moduleDiscipline, renderModules, renderModuleTree } from './modules';
import { renderArchitecture, renderFolder, renderImportDiscipline, renderRules } from './sections';
import type { ArchitectureDef, ModuleDef } from '../../config';

function arch(over: Partial<ArchitectureDef> = {}, modules?: ModuleDef[]): ArchitectureDef {
  return {
    alias: '~app',
    layers: [
      { name: 'components', does: 'UI' },
      { name: 'hooks', does: 'state', owns: ['zustand'] },
    ],
    folder: { layout: 'folder', entry: 'index', private: ['styles'] },
    ...(modules ? { modules } : {}),
    ...over,
  };
}

const layered: ModuleDef[] = [
  { name: 'Shell', does: 'app frame' },
  { name: 'Combat', does: 'the fight loop', owns: ['howler'], entry: 'main' },
  { name: 'Lobby', does: 'matchmaking', allowedImporters: [{ module: 'Shell', selfOnly: true }] },
  { name: 'common', does: 'shared helpers', layers: false },
];

// Every one of these renderers is the flat structure's byte-for-byte guarantee:
// a handbook with no `architecture.modules` must read exactly as it did before
// the module axis existed, and each of them answers `[]` to make that true.
describe('the flat structure renders no module passage at all', () => {
  const flat = arch();

  it.each([
    ['renderModules', renderModules],
    ['renderModuleTree', renderModuleTree],
    ['moduleDiscipline', moduleDiscipline],
  ])('%s is empty', (_label, render) => {
    expect(render(flat)).toEqual([]);
  });

  it('featureRoot is the bare layer name', () => {
    expect(featureRoot(flat, 'components')).toBe('components');
  });
});

describe('renderModules', () => {
  const out = renderModules(arch({}, layered)).join('\n');

  it('mirrors the layers table and adds the facts only a module has', () => {
    expect(out).toContain('### Modules');

    expect(out).toContain(
      '| Module | Responsibility | Holds | Entry | Importable by | Must not import | Owns |',
    );
  });

  it('says which modules nest the shared layers and which hold their files', () => {
    // `zustand` is the `hooks` LAYER's; a module's Owns column carries only what
    // the module itself declares, or the two axes' ownership reads as one.
    expect(out).toContain('| `Shell` | app frame | the layers below | `index` | — | — | — |');
    expect(out).toContain('| `common` | shared helpers | its own files (`layers: false`) |');
  });

  it('resolves a module\'s entry, override or inherited', () => {
    // `Combat` overrides; `Shell` inherits `architecture.folder.entry`. Printing
    // the raw field would leave three of four rows blank.
    expect(out).toContain('| `Combat` | the fight loop | the layers below | `main` |');
  });

  it('computes "must not import" from declaration order, narrowed by allowedImporters', () => {
    // Default order: a module may import only modules declared after it, so each
    // row's forbidden set is every module ahead of it.
    expect(out).toContain('| `Lobby` | matchmaking | the layers below | `index` '
      + '| `Shell` (selfOnly) | `Shell`, `Combat` |');

    // The row where the narrowing — not the order — decides: `Lobby` is declared
    // AFTER `Combat`, so declaration order alone would let `Combat` import it.
    // `Lobby.allowedImporters` is `[Shell]`, which bars it. Swapping
    // `getForbiddenModules` for `modules.slice(0, index)` fails here and nowhere else.
    expect(out).toContain('| `Combat` | the fight loop | the layers below | `main` '
      + '| `Shell` | `Shell`, `Lobby` | `howler` |');

    expect(out).toContain('`Shell`, `Combat`, `Lobby` |');
  });

  it('resolves the default importer set, so the selfOnly bullet has a subject here', () => {
    // `Shell` is declared first, so nothing may import it — a true `—`, not an
    // omission. `common` declares no allowedImporters and takes the default.
    expect(out).toContain('| `Shell` | app frame | the layers below | `index` | — |');

    expect(out).toContain(
      '| `common` | shared helpers | its own files (`layers: false`) | `index` '
      + '| `Shell`, `Combat`, `Lobby` | `Shell`, `Combat`, `Lobby` | — |',
    );
  });

  it('states the flow rule once, where the order it reads from is printed', () => {
    expect(out).toContain('a module may import only modules declared after it');
  });
});

describe('renderModuleTree', () => {
  it('draws the first layer-keeping module, its entry, and its layer folders', () => {
    const out = renderModuleTree(arch({}, layered)).join('\n');

    expect(out).toContain('Shell/');
    expect(out).toContain('├─ index       # the module\'s entry — what `~app/Shell` resolves to');
    expect(out).toContain('├─ components/ # a declared layer, nested inside the module');
    expect(out).toContain('└─ hooks/      # a declared layer, nested inside the module');
  });

  it('falls back to the first module when none keeps the layers', () => {
    // The same choice `undeclared-folder` makes: a `layers: false` module is not
    // somewhere a layer folder may go, so it is never the example while another
    // module could be — and when none can, the tree still has to draw something.
    const out = renderModuleTree(
      arch({}, [{ name: 'common', does: 'helpers', layers: false }]),
    ).join('\n');

    expect(out).toContain('common/');
    expect(out).toContain('└─ …     # its own files — this module declares `layers: false`');
    expect(out).not.toContain('a declared layer');
  });

  it('names the module\'s own entry override in the tree', () => {
    const out = renderModuleTree(
      arch({}, [{ name: 'Combat', does: 'fight', entry: 'main' }]),
    ).join('\n');

    expect(out).toContain('├─ main        # the module\'s entry — what `~app/Combat` resolves to');
  });
});

describe('featureRoot', () => {
  it('puts the layer one segment inside the example module', () => {
    expect(featureRoot(arch({}, layered), 'components')).toBe('Shell/components');
  });

  it('drops the layer segment when the example module holds its files directly', () => {
    expect(
      featureRoot(arch({}, [{ name: 'common', does: 'helpers', layers: false }]), 'components'),
    ).toBe('common');
  });
});

describe('moduleDiscipline', () => {
  const bullets = moduleDiscipline(arch({ alias: '~src' }, layered)).join('\n');

  it('states the boundaries a layer has no counterpart for', () => {
    expect(bullets).toContain('**Module entry only**');
    expect(bullets).toContain('**Same-module imports are relative**');
    expect(bullets).toContain('**A module\'s root files are its own wiring**');
  });

  it('spells both in the project\'s own alias, never a hard-coded one', () => {
    expect(bullets).toContain('`~src/<Module>`');
    expect(bullets).toContain('`~src/<Module>/<layer>`');
    expect(bullets).not.toContain('~app');
  });

  it('names the modules the cross-layer route does not exist inside', () => {
    // `~app/common/components` is a lint error: `buildModuleSelfBan` gives a
    // `layers: false` module the blanket same-module ban, with no layer name to
    // negate back out. Naming the route without naming who lacks it is the
    // sentence an agent followed into that error.
    expect(bullets).toContain(
      'Not inside `common` (`layers: false`) — there it covers the whole subtree, '
      + 'cross-layer route included.',
    );
  });

  it('states the route unqualified when every module nests the layers', () => {
    const allLayered = moduleDiscipline(arch({ alias: '~src' }, [
      { name: 'Shell', does: 'app frame' },
      { name: 'Combat', does: 'fight' },
    ])).join('\n');

    expect(allLayered).toContain(
      'The same-module ban leaves one path open: `~src/<Module>/<layer>`, the cross-layer '
      + 'route one depth in.',
    );

    expect(allLayered).not.toContain('Not inside');
  });

  it('closes the same-module ban, never every alias spelling, when no module nests '
    + 'a layer', () => {
    // Measured: `~src/<Other>` from inside a `layers: false` module is CLEAN, and
    // in an all-opt-out repo it is the only cross-module route there is — so a
    // sentence over every alias spelling denies the one route that works and
    // contradicts the entry bullet above it. This one answers for the
    // same-module ban alone.
    const optOut = moduleDiscipline(arch({ alias: '~src' }, [
      { name: 'common', does: 'helpers', layers: false },
      { name: 'Combat', does: 'fight', layers: false },
    ])).join('\n');

    expect(optOut).toContain(
      'Every module here declares `layers: false`, so the same-module ban covers each '
      + 'module\'s whole subtree — there is no cross-layer route open anywhere here.',
    );

    expect(optOut).toContain('reach another module at `~src/<Module>`');
    expect(optOut).not.toContain('`~src/<Module>/<layer>`');
    // No layer inside any module means no file inside one, so the dead end below
    // has nobody to warn — a bullet about it there would be about nothing.
    expect(optOut).not.toContain('root files are its own wiring');
  });

  it('says the module root files are out of reach, rather than naming a route', () => {
    // The two emitted errors each point at the other's banned route — relative
    // says "use the alias", the alias ban says "make it relative". The handbook
    // has to say the target cannot be reached, and where the code belongs instead.
    expect(bullets).toContain(
      '- **A module\'s root files are its own wiring** — they sit outside every layer, so '
      + 'nothing inside a layer reaches them: `../<file>` leaves the layer, and '
      + '`~src/<Module>/<file>` is a same-module alias import. Both are errors, so what a '
      + 'layer needs lives in a layer.',
    );
  });
});

describe('the handbook sections that carry them', () => {
  it('puts the modules table before the layers table', () => {
    const out = renderArchitecture(arch({}, layered));

    expect(out.indexOf('### Modules')).toBeLessThan(out.indexOf('### Layers'));
  });

  it('says where a layer sits without claiming one exists', () => {
    // A config whose every module declares `layers: false` has no layer folder
    // anywhere, so this sentence is about placement, never about presence.
    expect(renderArchitecture(arch({}, layered))).toContain(
      'a declared layer sits one level inside a module rather than at the source root',
    );
  });

  it('draws the module tree above the feature tree, in both folder layouts', () => {
    const folder = renderFolder(arch({}, layered), 'components');

    const flat = renderFolder(
      arch({ folder: { layout: 'flat', entry: 'index', private: [] } }, layered),
      'components',
    );

    expect(folder.indexOf('Shell/\n')).toBeLessThan(folder.indexOf('Shell/components/'));
    expect(flat).toContain('One feature module = one folder at the source root.');
    expect(flat).toContain('One feature = one file (flat layout).');
  });

  it('carries the module address into the per-layer folder exceptions too', () => {
    // Its agent-contract twin already says `src/<Module>/components/`; a handbook
    // still saying `components/` names the very path `undeclared-folder` moves
    // code out of, and the two live outputs then address one folder two ways.
    const withOverride = arch(
      { layers: [{ name: 'components', does: 'UI', folder: { layout: 'flat' } }] },
      layered,
    );

    expect(renderFolder(withOverride, 'components'))
      .toContain('- `<Module>/components/` — one file per feature (flat).');

    expect(renderFolder({ ...withOverride, modules: undefined }, 'components'))
      .toContain('- `components/` — one file per feature (flat).');
  });

  it('carries it into a folder-layout exception as well', () => {
    const withOverride = arch(
      { layers: [{ name: 'components', does: 'UI', folder: { layout: 'folder', entry: 'main' } }] },
      layered,
    );

    expect(renderFolder(withOverride, 'components'))
      .toContain('- `<Module>/components/` — one folder per feature, entry `main`.');

    expect(renderFolder({ ...withOverride, modules: undefined }, 'components'))
      .toContain('- `components/` — one folder per feature, entry `main`.');
  });

  it('names the gates\' reach per module in the Rules note, and leaves flat alone', () => {
    // Same class as the contract's own hard-gates clause: under a modular
    // blueprint the globs are cut per module, and an all-opt-out repo has no
    // layer folder at all — "a layer glob" tells its reader nothing is armed.
    const rules = { maxLines: 'error' as const };

    expect(renderRules(rules, { modules: layered })).toContain(
      'Every row reaches only the files a module glob matches: a declared module or layer '
      + 'holding no code has nothing that can fail',
    );

    expect(renderRules(rules)).toContain(
      'Every row reaches only the files a layer glob matches: a declared layer holding no '
      + 'code has nothing that can fail',
    );
  });

  it('names the module axis in the ownership bullet and drops it when flat', () => {
    expect(renderImportDiscipline(arch({}, layered))).toContain(
      'What a module owns reaches every layer nested inside it',
    );

    expect(renderImportDiscipline(arch())).toContain(
      '- **Ownership** — packages and globals are restricted to their owning layer '
      + '(see the *Owns* column above).',
    );
  });

  it('fires the selfOnly bullet for a module-only narrowing, and names both axes', () => {
    // `emitLint` emits the re-export ban off either axis, so a bullet keyed to
    // layer-level selfOnly alone left a module-level one enforced and unstated.
    expect(renderImportDiscipline(arch({}, layered))).toContain(
      '- **selfOnly** — where a module narrows its importers',
    );

    const narrowed = { layer: 'components', selfOnly: true };

    const both = arch({
      layers: [
        { name: 'components', does: 'UI' },
        { name: 'hooks', does: 'state', allowedImporters: [narrowed] },
      ],
    }, layered);

    expect(renderImportDiscipline(both)).toContain(
      '- **selfOnly** — where a layer or module narrows its importers',
    );
  });
});
