import { describe, expect, it } from 'vitest';

import { defineBlueprint } from '../../config';
import { emitLint } from './lint';
import type { LintConfig } from './types';

/**
 * A layer or module name is adopter data substituted into a glob template, and
 * `String.prototype.replace` reads `$$`, `` $` ``, `$'` and `$&` in a *string*
 * replacement as replacement patterns. `validateLayerName` and
 * `validateModuleName` turn away glob, path, quote and diagram characters, and
 * neither set holds `$` or a backtick — so `price$$tag` is a legal name, and
 * every surface that is NOT built by substitution prints it correctly.
 *
 * That asymmetry is what this file asserts against, at the level the unit
 * suites cannot reach: whether the positions that spell one name inside ONE
 * emitted config agree. The file net is built by substitution; the ban patterns
 * are built by template literal; the `blueprint/relative-escape` options key the
 * name directly. A collapsed substitution leaves the net saying `price$tag`
 * while its own bans say `price$$tag` — one config, two spellings of one name,
 * and the half that disagrees is the one deciding which files the rules ever
 * reach.
 */

const LAYER = 'price$$tag';
const MODULE = 'Price$$Tag';

/**
 * Every distinct spelling of a name anywhere in the emitted config — the
 * agreement assertion itself. A `toContain` on the net alone passes an
 * implementation that gets the net right and the bans wrong; the defect's own
 * signature is the halves disagreeing, so what has to be pinned is the count.
 */
function spellings(config: LintConfig, stem: string): string[] {
  // Read off the serialized config, so no position can be left out by naming
  // the ones to look at. The stop set is JSON's and the emitted config's own
  // punctuation — the quote a name is wrapped in, the path separator, the glob
  // star, the extension dot, and the backslash JSON escapes that quote with.
  const found = JSON.stringify(config).match(new RegExp(`${stem}[^"/*.\\\\]*`, 'g')) ?? [];

  return [...new Set(found)].sort();
}

/** Every `no-restricted-imports` group glob the config carries, flattened. */
function groupGlobs(config: LintConfig): string[] {
  return config.flatMap((entry) => {
    const restricted = entry.rules?.['no-restricted-imports'];
    const options = Array.isArray(restricted) ? restricted[1] : undefined;
    const patterns = (options as { patterns?: { group: string[] }[] } | undefined)?.patterns ?? [];

    return patterns.flatMap((pattern) => pattern.group);
  });
}

/** Every `no-restricted-imports` exact-path name the config carries. */
function pathNames(config: LintConfig): string[] {
  return config.flatMap((entry) => {
    const restricted = entry.rules?.['no-restricted-imports'];
    const options = Array.isArray(restricted) ? restricted[1] : undefined;

    return ((options as { paths?: { name: string }[] } | undefined)?.paths ?? [])
      .map((path) => path.name);
  });
}

/** The `blueprint/relative-escape` options of every entry that carries the rule. */
function escapeOptions(config: LintConfig): { layouts: object; root?: string }[] {
  return config
    .map((entry) => entry.rules?.['blueprint/relative-escape'])
    .filter((rule) => Array.isArray(rule))
    .map((rule) => (rule as unknown[])[1] as { layouts: object; root?: string });
}

describe('emitLint · a LAYER name carrying a replacement pattern (AC21)', () => {
  const config = emitLint(defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'components', does: 'UI' },
        { name: LAYER, does: 'pricing' },
      ],
      folder: { layout: 'flat', entry: 'index', private: [] },
    },
  }));

  it('spells the layer the same way in the file net, the bans, and the layouts key', () => {
    // The net decides which files the layer's rules reach at all, so a collapsed
    // one is not cosmetic: that layer's emitted rules match nothing and enforce
    // nothing, while every ban beside them still names the layer in full.
    expect(config.flatMap((entry) => entry.files ?? []))
      .toContain(`src/${LAYER}/**/*.{js,jsx,ts,tsx}`);

    expect(groupGlobs(config)).toContain(`~app/${LAYER}/**`);

    for (const options of escapeOptions(config)) {
      expect(Object.keys(options.layouts)).toContain(LAYER);
    }

    // One spelling in the whole artifact. `price$tag` anywhere is the red.
    expect(spellings(config, 'price')).toEqual([LAYER]);
  });
});

describe('emitLint · a MODULE name carrying a replacement pattern (AC21)', () => {
  const config = emitLint(defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'components', does: 'UI' },
        { name: 'hooks', does: 'state' },
      ],
      modules: [
        { name: 'Shell', does: 'app frame' },
        { name: MODULE, does: 'pricing' },
      ],
      folder: { layout: 'flat', entry: 'index', private: [] },
    },
  }));

  it('spells the module the same way in both nets, the self-ban, and the escape root', () => {
    const files = config.flatMap((entry) => entry.files ?? []);

    // The module's own root files — the descent collapse — and a layer nested
    // inside it, which is the placeholder substitution one call further on.
    expect(files).toContain(`src/${MODULE}/*.{js,jsx,ts,tsx}`);
    expect(files).toContain(`src/${MODULE}/components/**/*.{js,jsx,ts,tsx}`);

    expect(pathNames(config)).toContain(`~app/${MODULE}`);

    expect(escapeOptions(config).map((options) => options.root)).toContain(MODULE);

    expect(spellings(config, 'Price')).toEqual([MODULE]);
  });
});
