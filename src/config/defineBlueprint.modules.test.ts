import { describe, expect, it } from 'vitest';

import { defineBlueprint } from './defineBlueprint';
import type { Blueprint } from './types';

function base(): Blueprint {
  return {
    framework: 'auto',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'components', does: 'UI' },
        { name: 'hooks', does: 'state' },
        { name: 'services', does: 'net' },
      ],
      modules: [
        { name: 'Combat', does: 'the fight loop' },
        { name: 'Lobby', does: 'matchmaking', layers: false },
      ],
    },
  };
}

describe('defineBlueprint · architecture.modules — accepted shapes', () => {
  it('accepts a config that omits modules entirely — the flat structure', () => {
    const config = base();

    delete config.architecture.modules;

    expect(() => defineBlueprint(config)).not.toThrow();
  });

  it('accepts modules declared with no layers key, and with layers: false', () => {
    expect(() => defineBlueprint(base())).not.toThrow();
  });

  it('accepts a module owning primitives, same shape as a layer', () => {
    const config = base();

    config.architecture.modules![0].owns = ['axios', { global: 'fetch' }];

    expect(() => defineBlueprint(config)).not.toThrow();
  });

  it('accepts allowedImporters as strings and objects naming an earlier module', () => {
    const config = base();

    config.architecture.modules!.push({ name: 'Shell', does: 'app chrome' });

    config.architecture.modules![2].allowedImporters = [
      'Combat',
      { module: 'Lobby', selfOnly: true, description: 'entry only' },
    ];

    expect(() => defineBlueprint(config)).not.toThrow();
  });

  it('accepts an entry override on a module', () => {
    const config = base();

    config.architecture.modules![0].entry = 'main';

    expect(() => defineBlueprint(config)).not.toThrow();
  });
});

describe('defineBlueprint · architecture.modules — the envelope', () => {
  it('rejects modules that is not an array', () => {
    const config = base();

    config.architecture.modules = {} as never;

    expect(() => defineBlueprint(config)).toThrow(/architecture\.modules must be an array/);
  });

  it('rejects an empty modules array — say nothing, or omit the key', () => {
    const config = base();

    config.architecture.modules = [];

    expect(() => defineBlueprint(config)).toThrow(/architecture\.modules must not be empty/);
  });

  it('rejects an unknown key on a module, and points a renamed one home', () => {
    const config = base();

    (config.architecture.modules![0] as never as { extra: string }).extra = 'x';

    expect(() => defineBlueprint(config)).toThrow(/Unknown key "extra" in module "Combat"/);
  });
});

describe('defineBlueprint · architecture.modules — module identity', () => {
  it('rejects an unnamed module', () => {
    const config = base();

    config.architecture.modules!.push({ name: '' as never, does: 'x' });

    expect(() => defineBlueprint(config)).toThrow(/Each module must have a non-empty name/);
  });

  it('rejects a module name that is glob or path syntax', () => {
    const config = base();

    config.architecture.modules!.push({ name: 'Combat/*', does: 'x' });

    expect(() => defineBlueprint(config)).toThrow(/contains glob or path characters/);
  });

  it('rejects a module name with characters that corrupt emitted artifacts', () => {
    const config = base();

    config.architecture.modules!.push({ name: 'Com bat', does: 'x' });

    expect(() => defineBlueprint(config)).toThrow(/characters that corrupt emitted artifacts/);
  });

  // AC14 (1/3): two modules sharing one name.
  it('AC14 · rejects two modules sharing one name', () => {
    const config = base();

    config.architecture.modules!.push({ name: 'Combat', does: 'a rematch' });

    expect(() => defineBlueprint(config)).toThrow(/Duplicate module name: "Combat"/);
  });

  // A layer and a module sharing one name: `emit/lint`'s ownership resolution
  // (bans.ts) keys owners by bare name across both axes, so this exact collision
  // is what would let the module's `owns` silently apply to the same-named layer
  // too. Rejecting it here is the chosen fix — see modules.ts's own comment.
  it('rejects a module sharing a name with a declared layer', () => {
    const config = base();

    config.architecture.layers.push({ name: 'Combat', does: 'a nested layer' });
    config.architecture.modules![0].owns = ['axios'];

    expect(() => defineBlueprint(config)).toThrow(
      /Module "Combat" shares its name with a declared layer/,
    );
  });
});

describe('defineBlueprint · architecture.modules — layers: false is the only opt-out', () => {
  // AC14 (3/3): a `layers` value that is neither omitted nor `false`.
  it('AC14 · rejects a layers value that is neither omitted nor false', () => {
    const config = base();

    config.architecture.modules![0].layers = true as never;

    expect(() => defineBlueprint(config)).toThrow(
      /Module "Combat" has layers "true" — false is the only accepted value/,
    );
  });

  it('rejects layers: "false" (the string) the same way — only the boolean counts', () => {
    const config = base();

    config.architecture.modules![0].layers = 'false' as never;

    expect(() => defineBlueprint(config)).toThrow(/false is the only accepted value/);
  });
});

describe('defineBlueprint · architecture.modules — owns / entry, wrong type vs. blank', () => {
  it.each([
    [
      'a module name',
      (bp: Blueprint) => { bp.architecture.modules!.push({ name: 7 as never, does: 'x' }); },
      /non-empty name/,
    ],
    [
      'an owned global name',
      (bp: Blueprint) => { bp.architecture.modules![0].owns = [{ global: 5 as never }]; },
      /Module "Combat" owns a global with no name/,
    ],
    [
      'an owned package name',
      (bp: Blueprint) => { bp.architecture.modules![0].owns = [{ package: 5 as never }]; },
      /Module "Combat" owns a package with no name/,
    ],
    [
      'an empty owned package string',
      (bp: Blueprint) => { bp.architecture.modules![0].owns = [''] as never; },
      /Module "Combat" owns an empty package name/,
    ],
    [
      'an entry override',
      (bp: Blueprint) => { bp.architecture.modules![0].entry = 3 as never; },
      /Module "Combat" has an empty entry override/,
    ],
    [
      'an owns entry with an unknown key',
      (bp: Blueprint) => {
        bp.architecture.modules![0].owns = [{ global: 'fetch', extra: 1 } as never];
      },
      /Unknown key "extra" in module "Combat" owns entry "fetch"/,
    ],
  ])('names the field when %s is not the right shape', (_label, mutate, pattern) => {
    const config = base();

    mutate(config);
    expect(() => defineBlueprint(config)).toThrow(pattern);
  });
});

describe('defineBlueprint · architecture.modules — allowedImporters, acyclic-by-order', () => {
  // AC14 (2/3a): naming a module not declared at all.
  it('AC14 · rejects allowedImporters naming a module that is not declared', () => {
    const config = base();

    config.architecture.modules![1].allowedImporters = ['Nowhere'];

    expect(() => defineBlueprint(config)).toThrow(
      /Module "Lobby" allows importer "Nowhere", which is not a module declared before it/,
    );
  });

  // AC14 (2/3b): naming a module declared at or after the current one — distinct
  // from "not declared at all": Shell IS a declared module, just not an earlier one.
  it('AC14 · rejects allowedImporters naming a module declared after it', () => {
    const config = base();

    config.architecture.modules!.push({ name: 'Shell', does: 'app chrome' });
    // Lobby (index 1) names Shell (index 2, declared AFTER Lobby) as an allowed
    // importer — Shell exists, but not among the modules declared before Lobby.
    config.architecture.modules![1].allowedImporters = ['Shell'];

    expect(() => defineBlueprint(config)).toThrow(
      /Module "Lobby" allows importer "Shell", which is not a module declared before it/,
    );
  });

  it('AC14 · rejects a module listing itself as an allowed importer', () => {
    const config = base();

    config.architecture.modules![1].allowedImporters = ['Combat', 'Lobby'];

    expect(() => defineBlueprint(config)).toThrow(
      /Module "Lobby" cannot list itself as an allowed importer/,
    );
  });

  it('rejects an allowedImporters entry with no module name', () => {
    const config = base();

    config.architecture.modules![1].allowedImporters = [{ module: '' as never }];

    expect(() => defineBlueprint(config)).toThrow(
      /Module "Lobby" has an allowedImporters entry with no module/,
    );
  });

  it('rejects an allowedImporters entry with an unknown key', () => {
    const config = base();

    config.architecture.modules![1].allowedImporters = [{ module: 'Combat', layer: 'x' } as never];

    expect(() => defineBlueprint(config)).toThrow(
      /Unknown key "layer" in module "Lobby" allowedImporters entry "Combat"/,
    );
  });

  it('rejects the same importer listed more than once', () => {
    const config = base();

    config.architecture.modules![1].allowedImporters = ['Combat', 'Combat'];

    expect(() => defineBlueprint(config)).toThrow(
      /Module "Lobby" lists importer "Combat" more than once/,
    );
  });
});
