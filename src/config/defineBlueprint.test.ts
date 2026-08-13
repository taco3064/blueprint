import { describe, expect, it } from 'vitest';

import { defineBlueprint, validateBlueprint } from './defineBlueprint';
import type { Blueprint } from './types';

function base(): Blueprint {
  return {
    framework: 'auto',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'components', does: '可重用 UI', mustNot: ['import services'], layout: 'folder' },
        { name: 'hooks', does: 'inject / 加工 state', layout: 'folder' },
        { name: 'services', does: '網路原件', owns: ['axios', { global: 'fetch' }] },
      ],
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

describe('validateBlueprint', () => {
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

  it('rejects an empty layer entry, accepts an absent one (field issue #23)', () => {
    const config = base();

    config.architecture.layers[0].entry = '';

    expect(() => validateBlueprint(config)).toThrow(/empty entry/);

    // The playbook's "flat default" is real: a layer that declares neither key
    // is complete.
    delete config.architecture.layers[0].entry;
    delete config.architecture.layers[0].layout;

    expect(() => validateBlueprint(config)).not.toThrow();

    config.architecture.layers[0].layout = 'diagonal' as never;

    expect(() => validateBlueprint(config)).toThrow(/folder \| flat/);
  });

  it('names the replacement when a 3.x config still carries architecture.module', () => {
    const config = base();

    (config.architecture as unknown as Record<string, unknown>).module
      = { layout: 'folder', entry: 'index', private: ['hooks'] };

    // Not the generic "nothing reads it": the shape moved rather than vanished,
    // and a flat project has to make the same edit.
    expect(() => validateBlueprint(config)).toThrow(/moved onto each layer in 4\.0\.0/);
    expect(() => validateBlueprint(config)).toThrow(/layout.*entry/s);
    expect(() => validateBlueprint(config)).toThrow(/flat project/);
  });

  it('names the replacement when the layer still carries a module override', () => {
    const config = base();

    (config.architecture.layers[0] as unknown as Record<string, unknown>).module
      = { layout: 'folder', entry: 'main' };

    expect(() => validateBlueprint(config)).toThrow(/moved onto each layer in 4\.0\.0/);
  });

  it('rejects a layer-level selfOnly with the pointed fix (field issue #14)', () => {
    const config = base();

    // The exact field shape: intent declared where nothing reads it — the
    // re-export ban silently never existed.
    (config.architecture.layers[0] as unknown as Record<string, unknown>).selfOnly = true;

    expect(() => validateBlueprint(config)).toThrow(/allowedImporters ENTRY/);
    expect(() => validateBlueprint(config)).toThrow(/selfOnly/);
  });

  it('rejects unknown keys everywhere a silent no-op could hide', () => {
    const stray = (mutate: (config: ReturnType<typeof base>) => void, pattern: RegExp) => {
      const config = base();

      mutate(config);
      expect(() => validateBlueprint(config)).toThrow(pattern);
    };

    stray((c) => ((c as unknown as Record<string, unknown>).flows = []), /Unknown key "flows" in the blueprint/);
    stray((c) => ((c.architecture as unknown as Record<string, unknown>).flow = 'one-way'), /Unknown key "flow" in architecture/);
    stray((c) => ((c as { emit?: Record<string, unknown> }).emit = { agent: ['claude'] }), /Unknown key "agent" in emit/);
    stray((c) => ((c as { emit?: object }).emit = { lint: { level: 'warn' } }), /emit\.lint/);
    stray((c) => ((c as { emit?: object }).emit = { agents: [{ target: 'claude', file: 'X.md' }] }), /emit\.agents entry/);
    stray((c) => (c.architecture.layers[0].owns = [{ package: 'axios', import: ['get'] } as never]), /owns entry "axios"/);
    stray((c) => (c.architecture.layers[0].owns = [{ global: 'fetch', scope: 'all' } as never]), /owns entry "fetch"/);

    stray(
      (c) => (c.architecture.layers[1].allowedImporters = [{ layer: 'components', selfonly: true } as never]),
      /allowedImporters entry "components"/,
    );
  });

  it('rejects a layer layout that is neither folder nor flat', () => {
    const config = base();

    config.architecture.layers[0].layout = 'stacked' as never;

    expect(() => validateBlueprint(config)).toThrow(/expected folder \| flat/);
  });

  it('rejects a whitespace-only layer entry', () => {
    const config = base();

    config.architecture.layers[0].entry = '  ';

    expect(() => validateBlueprint(config)).toThrow(/empty entry/);
  });

  it('accepts layers that disagree about their module shape', () => {
    const config = base();

    config.architecture.layers[0].entry = 'main';
    config.architecture.layers[2].layout = 'flat';

    expect(() => validateBlueprint(config)).not.toThrow();
  });

  it('rejects invalid additionalAliases', () => {
    const config = base();

    config.architecture.additionalAliases = { '~x': '' };

    expect(() => validateBlueprint(config)).toThrow(/additionalAliases/);
  });

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

  it('rejects lintOverrides that touch an embedded plugin rule', () => {
    const config = base();

    config.architecture.layers[0].lintOverrides = { 'blueprint/no-deep-watch': 'off' };

    expect(() => validateBlueprint(config)).toThrow(/managed by the Enforce emitter/);
  });

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

describe('validateBlueprint · a wrong type is not the same as a blank string', () => {
  // Every "non-empty string" check has two arms: the value is not a string at
  // all, and it is a string with nothing in it. Only the blank arm was ever
  // exercised, so dropping the typeof guard left `.trim()` to be called on a
  // number — the config then fails with a TypeError raised inside blueprint
  // instead of the message naming the field to fix, which is the first thing an
  // adopter sees when a hand-written config is wrong.
  it.each([
    ['name', (bp: Blueprint) => { bp.name = 42 as never; }, /name must be a non-empty string/],
    ['alias', (bp: Blueprint) => { bp.architecture.alias = 42 as never; },
      /alias must be a non-empty string/],
    ['a layer name', (bp: Blueprint) => { bp.architecture.layers.push({ name: 7 as never, does: 'x' }); },
      /non-empty name/],
    // Anchored on the sentence, not the field name: a TypeError raised by
    // calling `.trim()` on a number says "entry.trim is not a function", which
    // matches a bare /entry/ just as well.
    ['a layer entry', (bp: Blueprint) => { bp.architecture.layers[0].entry = 1 as never; },
      /has an empty entry/],
    ['an owned global name', (bp: Blueprint) => { bp.architecture.layers[2].owns = [{ global: 5 as never }]; },
      /global with no name/],
    ['an owned package name', (bp: Blueprint) => { bp.architecture.layers[2].owns = [{ package: 5 as never }]; },
      /package with no name/],
    ['an allowed importer layer', (bp: Blueprint) => { bp.architecture.layers[2].allowedImporters = [{ layer: 9 as never }]; },
      /allowedImporters entry with no layer/],
    ['an emit.agents path', (bp: Blueprint) => { bp.emit = { agents: [{ target: 'windsurf', path: 4 as never }] }; },
      /has an empty path/],
  ])('names the field when %s is not a string', (_label, mutate, pattern) => {
    const config = base();

    mutate(config);
    expect(() => validateBlueprint(config)).toThrow(pattern);
  });

  // The other side of the same pair: a value that IS a string but holds only
  // whitespace. `!value` alone reads '   ' as present, so the config passes
  // validation and the whitespace travels into a filename, a glob, or a
  // restricted-import entry.
  it.each([
    ['a layer entry', (bp: Blueprint) => { bp.architecture.layers[0].entry = '   '; },
      /has an empty entry/],
    ['an owned package string', (bp: Blueprint) => { bp.architecture.layers[2].owns = ['   ']; },
      /empty package name/],
    ['an owned global name', (bp: Blueprint) => { bp.architecture.layers[2].owns = [{ global: '   ' }]; },
      /global with no name/],
  ])('rejects whitespace-only %s', (_label, mutate, pattern) => {
    const config = base();

    mutate(config);
    expect(() => validateBlueprint(config)).toThrow(pattern);
  });

  it('survives a null layer and a null rule setting', () => {
    // A hand-edited config leaves holes in arrays and objects. Reaching through
    // one without the optional chain crashes with a TypeError from inside
    // blueprint, and the adopter is left reading a stack trace instead of the
    // sentence that names the hole.
    const nullLayer = base();

    nullLayer.architecture.layers.push(null as never);
    expect(() => validateBlueprint(nullLayer)).toThrow(/non-empty name/);

    const nullRule = base();

    nullRule.rules = { maxLines: null as never };
    expect(() => validateBlueprint(nullRule)).toThrow(/invalid tier/);
  });
});

describe('validateBlueprint · the guards that must NOT fire', () => {
  it('accepts a layer that declares only an entry', () => {
    // The flat default is real (field issue #23): a layer with no `layout` is
    // complete. Validating the absent layout against the enum rejects a config
    // the playbook tells the author to write.
    const config = base();

    delete config.architecture.layers[0].layout;
    config.architecture.layers[0].entry = 'index';

    expect(() => validateBlueprint(config)).not.toThrow();
  });

  it('accepts the spaces a hand-written {layer} placeholder carries', () => {
    // `{ layer }` is how a human writes it, and emit substitutes it just the
    // same. Rejecting it here fails a config that works, with a message telling
    // the author to add a placeholder that is already there.
    const config = base();

    config.architecture.layerFiles = 'src/{ layer }/**/*.ts';

    expect(() => validateBlueprint(config)).not.toThrow();
  });

  it('accepts an emit block that declares no agents', () => {
    // `emit: { handbook: 'HB.md' }` never mentions agents, and the default
    // target set applies. Iterating a stand-in list in place of the absent one
    // validates entries the config never wrote.
    const config = base();

    config.emit = { handbook: 'HB.md' };

    expect(() => validateBlueprint(config)).not.toThrow();
  });
});

describe('validateBlueprint · checks that see every entry, not just one', () => {
  it('rejects a bad alias target sitting beside a good one', () => {
    // Every existing case gave additionalAliases exactly one entry, where "some
    // entry is bad" and "every entry is bad" answer alike. A real config has
    // several, and only one of them is the mistake.
    const config = base();

    config.architecture.additionalAliases = { '~shared': './src/shared', '~broken': '' };

    expect(() => validateBlueprint(config)).toThrow(/additionalAliases/);
  });

  it('checks a layerFiles glob written as a bare string', () => {
    // layerFiles takes a string or an array. The array form was covered, so
    // wrapping the string form could be dropped: the loop then runs zero times
    // and a glob with no placeholder passes, scoping every layer's rules to the
    // same files.
    const config = base();

    config.architecture.layerFiles = 'src/**/*.ts';

    expect(() => validateBlueprint(config)).toThrow(/must include the "\{layer\}" placeholder/);
  });
});

describe('validateBlueprint · every rule the emitter manages', () => {
  // Two of the six stood in for the list, so the other four could be dropped and
  // a `lintOverrides` entry would silently take effect — silently being the
  // problem. The emitter writes these rules per layer AFTER the overrides are
  // spread in, so an override on one of them is not a conflict the author can
  // see: it is simply discarded, and the layer behaves as if they never wrote it.
  it.each([
    'no-restricted-imports',
    'no-restricted-syntax',
    'no-restricted-globals',
    'max-lines',
    'blueprint/no-deep-watch',
    'blueprint/use-prefix',
  ])('refuses a lintOverrides entry for %s', (rule) => {
    const config = base();

    config.architecture.layers[0].lintOverrides = { [rule]: 'off' };

    expect(() => validateBlueprint(config)).toThrow(/managed by the Enforce emitter/);
  });

  it('still allows an override the emitter does not write', () => {
    // The guard is the list, not "no overrides at all" — a layer has to be able
    // to tune its own rules, which is what lintOverrides is for.
    const config = base();

    config.architecture.layers[0].lintOverrides = { 'no-console': 'error' };

    expect(() => validateBlueprint(config)).not.toThrow();
  });
});
