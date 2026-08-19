import { describe, expect, it } from 'vitest';

import { defineBlueprint, validateBlueprint } from './defineBlueprint';
import type { Blueprint } from './types';

function base(): Blueprint {
  return {
    framework: 'auto',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'components', does: '可重用 UI', mustNot: ['import services'] },
        { name: 'hooks', does: 'inject / 加工 state' },
        { name: 'services', does: '網路原件', owns: ['axios', { global: 'fetch' }] },
      ],
      folder: { layout: 'folder', entry: 'index', private: ['hooks', 'styles', 'types'] },
    },
  };
}

describe('defineBlueprint', () => {
  it('returns the same config object when valid', () => {
    const config = base();

    expect(defineBlueprint(config)).toBe(config);
  });

  it('accepts allowedImporters as strings and objects referencing earlier layers', () => {
    const config = base();

    config.architecture.layers[2].allowedImporters = [
      'components',
      { layer: 'hooks', selfOnly: true, description: 'net only' },
    ];

    expect(() => defineBlueprint(config)).not.toThrow();
  });

  it('accepts valid additionalAliases and layerFiles', () => {
    const config = base();

    config.architecture.additionalAliases = { '~shared': './src/shared' };
    config.architecture.layerFiles = 'src/{layer}/**/*.ts';

    expect(() => defineBlueprint(config)).not.toThrow();
  });
});

describe('validateBlueprint · the config envelope, and the keys nothing reads', () => {
  it('returns the blueprint unchanged so a passing call is visible (batch 10)', () => {
    const config = base();

    // A bare `undefined` read as "did this even run?" in the field.
    expect(validateBlueprint(config)).toBe(config);
  });

  it('rejects a blank name when provided', () => {
    const config = base();

    config.name = '   ';

    expect(() => validateBlueprint(config)).toThrow(/name must be a non-empty string/);
  });

  it('rejects a missing architecture', () => {
    const config = base();

    config.architecture = undefined as never;

    expect(() => validateBlueprint(config)).toThrow(/must be an array/);
  });

  it('rejects a missing alias', () => {
    const config = base();

    config.architecture.alias = '  ';

    expect(() => validateBlueprint(config)).toThrow(/alias must be a non-empty string/);
  });

  it('rejects unknown keys everywhere a silent no-op could hide', () => {
    const stray = (mutate: (config: ReturnType<typeof base>) => void, pattern: RegExp) => {
      const config = base();

      mutate(config);
      expect(() => validateBlueprint(config)).toThrow(pattern);
    };

    stray((c) => ((c as unknown as Record<string, unknown>).flows = []), /Unknown key "flows" in the blueprint/);
    stray((c) => ((c.architecture as unknown as Record<string, unknown>).flow = 'one-way'), /Unknown key "flow" in architecture — nothing reads it, so the declaration is silently dead\. Expected keys: alias, /);
    stray((c) => ((c.architecture.folder as unknown as Record<string, unknown>).privates = []), /architecture\.folder/);
    stray((c) => ((c as { emit?: Record<string, unknown> }).emit = { agent: ['claude'] }), /Unknown key "agent" in emit/);
    stray((c) => ((c as { emit?: object }).emit = { lint: { level: 'warn' } }), /emit\.lint/);
    stray((c) => ((c as { emit?: object }).emit = { agents: [{ target: 'claude', file: 'X.md' }] }), /emit\.agents entry/);
    stray((c) => (c.architecture.layers[0].owns = [{ package: 'axios', import: ['get'] } as never]), /owns entry "axios"/);
    stray((c) => (c.architecture.layers[0].owns = [{ global: 'fetch', scope: 'all' } as never]), /owns entry "fetch"/);
    stray((c) => (c.architecture.layers[0].folder = { layout: 'flat', entry: 'index', private: [] } as never), /folder override/);

    stray(
      (c) => (
        c.architecture.layers[1].allowedImporters = [{
          layer: 'components',
          selfonly: true,
        } as never]
      ),
      /allowedImporters entry "components"/,
    );
  });
});

describe('validateBlueprint · layers, and what a layer owns', () => {
  it('rejects empty layers', () => {
    const config = base();

    config.architecture.layers = [];

    expect(() => validateBlueprint(config)).toThrow(/must not be empty/);
  });

  it('rejects duplicate layer names', () => {
    const config = base();

    config.architecture.layers.push({ name: 'hooks', does: 'dup' });

    expect(() => validateBlueprint(config)).toThrow(/Duplicate layer name/);
  });

  it('rejects a layer with a blank name', () => {
    const config = base();

    config.architecture.layers.push({ name: '  ', does: 'blank' });

    expect(() => validateBlueprint(config)).toThrow(/non-empty name/);
  });

  it('rejects an owned empty package string', () => {
    const config = base();

    config.architecture.layers[2].owns = [''];

    expect(() => validateBlueprint(config)).toThrow(/empty package name/);
  });

  it('rejects an owned global with no name', () => {
    const config = base();

    config.architecture.layers[2].owns = [{ global: '' }];

    expect(() => validateBlueprint(config)).toThrow(/global with no name/);
  });

  it('rejects an owned package with no name', () => {
    const config = base();

    config.architecture.layers[2].owns = [{ package: '  ', imports: ['x'] }];

    expect(() => validateBlueprint(config)).toThrow(/package with no name/);
  });

  it('rejects layer names carrying glob or path characters', () => {
    // Batch 9's workaround: a layer literally named `*` widened every glob
    // to src/* and scaffolded a literal `src/*/` folder.
    for (const name of ['*', 'ui?', '{a,b}', 'a[0]', 'a/b', 'a\\b']) {
      const config = base();

      config.architecture.layers = [{ name, does: 'x' }];

      expect(() => validateBlueprint(config)).toThrow(/glob or path characters/);
    }
  });

  it('rejects layer names that would silently corrupt the emitted diagram', () => {
    // Whitespace breaks a mermaid edge, `&` joins nodes, `%%` comments —
    // fail loud at validation instead of emitting a broken handbook.
    for (const name of ['my layer', 'a&b', '(admin)', 'a;b', 'x%y', '"q"', 'it\'s']) {
      const config = base();

      config.architecture.layers = [{ name, does: 'x' }];

      expect(() => validateBlueprint(config)).toThrow(/corrupt emitted artifacts/);
    }
  });

  it('keeps conventional layer names — including scoped-style prefixes — valid', () => {
    const config = base();

    config.architecture.layers = [
      { name: '@core', does: 'x' },
      { name: 'ui-kit', does: 'x' },
      { name: 'v2.api', does: 'x' },
      { name: 'i18n_store', does: 'x' },
    ];

    expect(() => validateBlueprint(config)).not.toThrow();
  });
});

describe('validateBlueprint · folder layout, at the root and per layer', () => {
  it('rejects an empty folder entry, accepts an absent folder (field issue #23)', () => {
    const config = base();

    config.architecture.folder!.entry = '';

    expect(() => validateBlueprint(config)).toThrow(/folder\.entry/);

    // The playbook's "flat default" is real: a config that never mentions
    // folder — or writes only { layout: 'flat' } — is complete.
    delete config.architecture.folder;

    expect(() => validateBlueprint(config)).not.toThrow();

    config.architecture.folder = { layout: 'flat' };

    expect(() => validateBlueprint(config)).not.toThrow();

    config.architecture.folder = { layout: 'diagonal' as never };

    expect(() => validateBlueprint(config)).toThrow(/folder \| flat/);
  });

  it('rejects a non-array folder.private, accepts an omitted one', () => {
    const config = base();

    config.architecture.folder!.private = 'nope' as never;

    expect(() => validateBlueprint(config)).toThrow(/folder\.private/);

    // Optional with a default of none — a draft-first config that never
    // mentions private parts is valid (field issue #11).
    delete config.architecture.folder!.private;

    expect(() => validateBlueprint(config)).not.toThrow();
  });

  it('rejects a layer folder override with an unknown layout', () => {
    const config = base();

    config.architecture.layers[0].folder = { layout: 'stacked' as never };

    expect(() => validateBlueprint(config)).toThrow(/expected folder \| flat/);
  });

  it('rejects a layer folder override with an empty entry', () => {
    const config = base();

    config.architecture.layers[0].folder = { entry: '  ' };

    expect(() => validateBlueprint(config)).toThrow(/empty folder\.entry override/);
  });

  it('accepts a well-formed layer folder override', () => {
    const config = base();

    config.architecture.layers[0].folder = { layout: 'folder', entry: 'main' };

    expect(() => validateBlueprint(config)).not.toThrow();
  });

  it.each([
    ['architecture', 'in architecture.', (c: ReturnType<typeof base>): object => c.architecture],
    [
      'a layer',
      'in layer "components".',
      (c: ReturnType<typeof base>): object => c.architecture.layers[0],
    ],
  ])('opens on the rename for the old `module` spelling on %s', (_where, site, target) => {
    const config = base();

    delete config.architecture.folder;
    (target(config) as Record<string, unknown>).module = { layout: 'folder' };

    // The adopter typed what 3.1.0 documented, so the generic opening has to be
    // absent rather than merely followed by the rename — reporting a typo first
    // and correcting it afterwards is the shape this asserts against. Both
    // depths carry it: the shared shape and the per-layer override were renamed
    // together, and each names the declaration to edit.
    expect(() => validateBlueprint(config)).toThrow(/RENAMED to folder/);
    expect(() => validateBlueprint(config)).toThrow(/nothing removed/);
    expect(() => validateBlueprint(config)).toThrow(site);
    expect(() => validateBlueprint(config)).not.toThrow(/nothing reads it, so the declaration is silently dead/);
  });

  it('leaves a config that never spelled the renamed field alone (3.1.0 shape)', () => {
    // Indistinguishable from a 4.0.0 flat config, and read as flat because that
    // is what it says — not as a fallback for a `modules` block it never had.
    const config = base();

    delete config.architecture.folder;

    expect(validateBlueprint(config)).toBe(config);
  });
});

describe('validateBlueprint · aliases and the layer glob', () => {
  it('rejects invalid additionalAliases', () => {
    const config = base();

    config.architecture.additionalAliases = { '~x': '' };

    expect(() => validateBlueprint(config)).toThrow(/additionalAliases/);
  });

  it.each([
    ['an empty alias key', { '': 'src' }],
    ['a blank alias key', { '  ': 'src' }],
    ['a non-string target', { '~x': 1 }],
    ['an empty target', { '~x': '' }],
    ['a blank target', { '~x': '  ' }],
  ])('rejects additionalAliases with %s', (_label, additionalAliases) => {
    const config = base();

    config.architecture.additionalAliases = additionalAliases as Record<string, string>;

    expect(() => validateBlueprint(config)).toThrow(/additionalAliases/);
  });

  it('rejects additionalAliases that is not an object at all', () => {
    const config = base();

    // `Object.entries('nope')` yields character pairs that pass every per-entry
    // check, so the typeof guard is the only thing that catches this.
    config.architecture.additionalAliases = 'nope' as unknown as Record<string, string>;

    expect(() => validateBlueprint(config)).toThrow(/additionalAliases/);
  });

  it('rejects a layerFiles glob without the {layer} placeholder', () => {
    const config = base();

    config.architecture.layerFiles = ['src/**/*.ts'];

    expect(() => validateBlueprint(config)).toThrow(/must include the "\{layer\}" placeholder/);
  });
});

describe('validateBlueprint · allowedImporters', () => {
  it('rejects a layer-level selfOnly with the pointed fix (field issue #14)', () => {
    const config = base();

    // The exact field shape: intent declared where nothing reads it — the
    // re-export ban silently never existed.
    (config.architecture.layers[0] as unknown as Record<string, unknown>).selfOnly = true;

    expect(() => validateBlueprint(config)).toThrow(/allowedImporters ENTRY/);
    expect(() => validateBlueprint(config)).toThrow(/selfOnly/);
  });

  it('rejects an allowed importer with no layer', () => {
    const config = base();

    config.architecture.layers[2].allowedImporters = [{ layer: '  ' }];

    expect(() => validateBlueprint(config)).toThrow(/allowedImporters entry with no layer/);
  });

  it('rejects a layer listing itself as an importer', () => {
    const config = base();

    config.architecture.layers[2].allowedImporters = ['services'];

    expect(() => validateBlueprint(config)).toThrow(/cannot list itself/);
  });

  it('rejects an importer that is not declared before the layer', () => {
    const config = base();

    // hooks (index 1) may not be imported by services (index 2, declared later).
    config.architecture.layers[1].allowedImporters = ['services'];

    expect(() => validateBlueprint(config)).toThrow(/not a layer declared before it/);
  });

  it('rejects an unknown importer layer', () => {
    const config = base();

    config.architecture.layers[2].allowedImporters = ['ghost'];

    expect(() => validateBlueprint(config)).toThrow(/not a layer declared before it/);
  });

  it('rejects a duplicate importer', () => {
    const config = base();

    config.architecture.layers[2].allowedImporters = ['components', 'components'];

    expect(() => validateBlueprint(config)).toThrow(/more than once/);
  });
});

describe('validateBlueprint · rules and lint overrides', () => {
  it('rejects lintOverrides that touch a managed rule', () => {
    const config = base();

    config.architecture.layers[0].lintOverrides = {
      'no-restricted-imports': 'off',
    };

    expect(() => validateBlueprint(config)).toThrow(/managed by the Enforce emitter/);
  });

  it('accepts lintOverrides for a non-managed rule', () => {
    const config = base();

    config.architecture.layers[0].lintOverrides = {
      'react-refresh/only-export-components': 'off',
    };

    expect(() => validateBlueprint(config)).not.toThrow();
  });

  it('rejects lintOverrides that touch an embedded plugin rule', () => {
    const config = base();

    config.architecture.layers[0].lintOverrides = { 'blueprint/no-deep-watch': 'off' };

    expect(() => validateBlueprint(config)).toThrow(/managed by the Enforce emitter/);
  });

  it('rejects a rule with an invalid tier', () => {
    const config = base();

    config.rules = { maxLines: { tier: 'loud' as never, value: 400 } };

    expect(() => validateBlueprint(config)).toThrow(/invalid tier/);
  });

  it('accepts a rule as a bare tier string', () => {
    const config = base();

    config.rules = { noUtils: 'error' };

    expect(() => validateBlueprint(config)).not.toThrow();
  });

  it('rejects usePrefix targeting an undeclared layer', () => {
    const config = base();

    config.rules = { usePrefix: { tier: 'error', layer: 'ghost' } };

    expect(() => validateBlueprint(config)).toThrow(/targets layer "ghost"/);
  });

  it('defaults usePrefix to the hooks layer and validates it exists', () => {
    const config = base();

    config.rules = { usePrefix: 'error' };
    expect(() => validateBlueprint(config)).not.toThrow();

    config.architecture.layers = config.architecture.layers.filter(
      (layer) => layer.name !== 'hooks',
    );

    expect(() => validateBlueprint(config)).toThrow(/targets layer "hooks"/);
  });

  it('never validates the target layer of an OFF usePrefix', () => {
    const config = base();

    config.architecture.layers = config.architecture.layers.filter(
      (layer) => layer.name !== 'hooks',
    );

    // A rule that never emits has no target to validate — both shapes.
    config.rules = { usePrefix: 'off' };
    expect(() => validateBlueprint(config)).not.toThrow();

    config.rules = { usePrefix: { tier: 'off' } };
    expect(() => validateBlueprint(config)).not.toThrow();
  });
});

describe('validateBlueprint · principles, playbook and component shape', () => {
  // Every id/title check has three arms: an absent or non-string value, a
  // blank one, and a null entry the optional chain has to survive. The suite
  // covered the happy path and the duplicate, leaving the shape arms open —
  // and these throws are the first thing an adopter sees when a hand-written
  // config is wrong, so a silently-accepted junk entry surfaces much later as
  // an undefined somewhere in the emitters.
  it.each([
    ['a null principle', { principles: [null] }, /principle must have a non-empty id/],
    ['a non-string principle id', { principles: [{ id: 1, say: 's', why: 'w' }] }, /principle must have a non-empty id/],
    ['a blank principle id', { principles: [{ id: '  ', say: 's', why: 'w' }] }, /principle must have a non-empty id/],
    ['a null component-shape axis', { componentShape: [null] }, /axis must have a non-empty id/],
    ['a blank axis id', { componentShape: [{ id: ' ' }] }, /axis must have a non-empty id/],
    ['a null playbook section', { playbook: [null] }, /playbook section must have a non-empty title/],
    ['a blank playbook title', { playbook: [{ title: '  ', rules: [] }] }, /playbook section must have a non-empty title/],
    ['a null playbook rule', { playbook: [{ title: 't', rules: [null] }] }, /has a rule with no id/],
    ['a blank playbook rule id', { playbook: [{ title: 't', rules: [{ id: ' ', say: 's' }] }] }, /has a rule with no id/],
  ])('rejects %s', (_label, patch, pattern) => {
    expect(() => validateBlueprint({ ...base(), ...patch } as unknown as Blueprint))
      .toThrow(pattern);
  });

  it('rejects duplicate principle ids', () => {
    const config = base();

    config.principles = [
      { id: 'x', say: 'a', why: 'b', land: 'claude' },
      { id: 'x', say: 'c', why: 'd', land: 'lint' },
    ];

    expect(() => validateBlueprint(config)).toThrow(/Duplicate principle id/);
  });

  it('rejects a principle with a blank id', () => {
    const config = base();

    config.principles = [{ id: '  ', say: 'a', why: 'b', land: 'claude' }];

    expect(() => validateBlueprint(config)).toThrow(/non-empty id/);
  });

  it('rejects blank playbook titles and duplicate rule ids across sections', () => {
    const config = base();
    const rule = { id: 'sample-rule', say: 'Do it.' };

    // Defensive: a section without a rules array (untyped config file) is tolerated.
    config.playbook = [{ title: 'x', rules: undefined as never }];
    expect(() => validateBlueprint(config)).not.toThrow();

    config.playbook = [{ title: '  ', rules: [rule] }];
    expect(() => validateBlueprint(config)).toThrow(/non-empty title/);

    config.playbook = [{ title: 'x', rules: [{ ...rule, id: ' ' }] }];
    expect(() => validateBlueprint(config)).toThrow(/rule with no id/);

    config.playbook = [
      { title: 'BE', rules: [rule] },
      { title: 'Refactor', rules: [{ ...rule }] },
    ];

    expect(() => validateBlueprint(config)).toThrow(/Duplicate playbook rule id/);
  });

  it('rejects duplicate or blank component-shape axis ids', () => {
    const config = base();
    const axis = { id: 'io', name: 'IO', say: 'a', why: 'b' };

    config.componentShape = [axis, { ...axis, name: 'IO again' }];
    expect(() => validateBlueprint(config)).toThrow(/Duplicate component-shape axis id/);

    config.componentShape = [{ ...axis, id: '  ' }];
    expect(() => validateBlueprint(config)).toThrow(/axis must have a non-empty id/);
  });
});

describe('validateBlueprint · emit.agents', () => {
  it('accepts emit.agents entries as strings and objects', () => {
    const config = base();

    config.emit = { agents: ['claude', { target: 'cursor', path: '.cursor/rules/arch.mdc' }] };

    expect(() => validateBlueprint(config)).not.toThrow();
  });

  it('rejects an unknown emit.agents target', () => {
    const config = base();

    config.emit = { agents: ['copilot', 'aider' as never] };

    expect(() => validateBlueprint(config)).toThrow(/target "aider" is unknown/);
  });

  it('rejects a duplicate emit.agents target', () => {
    const config = base();

    config.emit = { agents: ['claude', { target: 'claude' }] };

    expect(() => validateBlueprint(config)).toThrow(/more than once/);
  });

  it('rejects an emit.agents entry with an empty path', () => {
    const config = base();

    config.emit = { agents: [{ target: 'windsurf', path: '  ' }] };

    expect(() => validateBlueprint(config)).toThrow(/has an empty path/);
  });
});
