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
      flow: 'one-way',
      module: { layout: 'folder', entry: 'index', private: ['hooks', 'styles', 'types'] },
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

  it('rejects a missing module entry', () => {
    const config = base();

    config.architecture.module.entry = '';

    expect(() => validateBlueprint(config)).toThrow(/module\.entry/);
  });

  it('rejects a non-array module.private', () => {
    const config = base();

    config.architecture.module.private = 'nope' as never;

    expect(() => validateBlueprint(config)).toThrow(/module\.private/);
  });

  it('rejects a layer module override with an unknown layout', () => {
    const config = base();

    config.architecture.layers[0].module = { layout: 'stacked' as never };

    expect(() => validateBlueprint(config)).toThrow(/expected folder \| flat/);
  });

  it('rejects a layer module override with an empty entry', () => {
    const config = base();

    config.architecture.layers[0].module = { entry: '  ' };

    expect(() => validateBlueprint(config)).toThrow(/empty module\.entry override/);
  });

  it('accepts a well-formed layer module override', () => {
    const config = base();

    config.architecture.layers[0].module = { layout: 'folder', entry: 'main' };

    expect(() => validateBlueprint(config)).not.toThrow();
  });

  it('rejects invalid additionalAliases', () => {
    const config = base();

    config.architecture.additionalAliases = { '~x': '' };

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
    const rule = { id: 'no-fake-fallback', say: 'Never fake.' };

    // Defensive: a section without a rules array (untyped config file) is tolerated.
    config.playbook = [{ title: 'BE', rules: undefined as never }];
    expect(() => validateBlueprint(config)).not.toThrow();

    config.playbook = [{ title: '  ', rules: [rule] }];
    expect(() => validateBlueprint(config)).toThrow(/non-empty title/);

    config.playbook = [{ title: 'BE', rules: [{ ...rule, id: ' ' }] }];
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
