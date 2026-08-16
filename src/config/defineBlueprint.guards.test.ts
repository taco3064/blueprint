import { describe, expect, it } from 'vitest';

import { validateBlueprint } from './defineBlueprint';
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
      module: { layout: 'folder', entry: 'index', private: ['hooks', 'styles', 'types'] },
    },
  };
}

describe('validateBlueprint · a wrong type is not the same as a blank string', () => {
  // Every "non-empty string" check has two arms: the value is not a string at
  // all, and it is a string with nothing in it. Only the blank arm was ever
  // exercised, so dropping the typeof guard left `.trim()` to be called on a
  // number — the config then fails with a TypeError raised inside blueprint
  // instead of the message naming the field to fix, which is the first thing an
  // adopter sees when a hand-written config is wrong.
  it.each([
    [
      'name',
      (bp: Blueprint) => { bp.name = 42 as never; },
      /name must be a non-empty string/,
    ],
    [
      'alias',
      (bp: Blueprint) => { bp.architecture.alias = 42 as never; },
      /alias must be a non-empty string/,
    ],
    [
      'a layer name',
      (bp: Blueprint) => { bp.architecture.layers.push({ name: 7 as never, does: 'x' }); },
      /non-empty name/,
    ],
    // Anchored on the sentence, not the field name: a TypeError raised by
    // calling `.trim()` on a number says "module.entry.trim is not a function",
    // which matches a bare /module\.entry/ just as well.
    [
      'module.entry',
      (bp: Blueprint) => { bp.architecture.module!.entry = 1 as never; },
      /must be a non-empty string when set/,
    ],
    [
      'a module override entry',
      (bp: Blueprint) => { bp.architecture.layers[0].module = { entry: 3 as never }; },
      /empty module\.entry override/,
    ],
    [
      'an owned global name',
      (bp: Blueprint) => { bp.architecture.layers[2].owns = [{ global: 5 as never }]; },
      /global with no name/,
    ],
    [
      'an owned package name',
      (bp: Blueprint) => { bp.architecture.layers[2].owns = [{ package: 5 as never }]; },
      /package with no name/,
    ],
    [
      'an allowed importer layer',
      (bp: Blueprint) => {
        bp.architecture.layers[2].allowedImporters = [{ layer: 9 as never }];
      },
      /allowedImporters entry with no layer/,
    ],
    [
      'an emit.agents path',
      (bp: Blueprint) => { bp.emit = { agents: [{ target: 'windsurf', path: 4 as never }] }; },
      /has an empty path/,
    ],
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
    [
      'module.entry',
      (bp: Blueprint) => { bp.architecture.module!.entry = '   '; },
      /must be a non-empty string when set/,
    ],
    [
      'an owned package string',
      (bp: Blueprint) => { bp.architecture.layers[2].owns = ['   ']; },
      /empty package name/,
    ],
    [
      'an owned global name',
      (bp: Blueprint) => { bp.architecture.layers[2].owns = [{ global: '   ' }]; },
      /global with no name/,
    ],
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
  it('accepts a module block that declares only an entry', () => {
    // The flat default is real (field issue #23): a module with no `layout` is
    // complete. Validating the absent layout against the enum rejects a config
    // the playbook tells the author to write.
    const config = base();

    config.architecture.module = { entry: 'index' };

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
