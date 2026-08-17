import { describe, expect, it } from 'vitest';

import {
  buildPackagePatterns,
  buildStructuralPatterns,
  derivePackageRules,
  deriveGlobalRules,
  resolveLayerFiles,
  selfOnlyReexportSelector,
  toArray,
} from './patterns';
import type { LayerDef } from '../../config';

describe('toArray', () => {
  it('wraps a string and passes an array through', () => {
    expect(toArray('a')).toEqual(['a']);
    expect(toArray(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('answers no globs for an option nobody set', () => {
    // The exact list, not just its emptiness: at the call site this arm used to be
    // a `?? []`, where a wrong value becomes one more glob — and a glob matching
    // nothing is indistinguishable from no glob. Here it is one value to compare.
    expect(toArray(undefined)).toEqual([]);

    // …and a single undefined is what a lost guard would produce, which downstream
    // becomes `globToRegExp(undefined)`.
    expect(toArray(undefined)).not.toContain(undefined);
  });
});

describe('resolveLayerFiles', () => {
  it('defaults the glob from the framework', () => {
    expect(resolveLayerFiles('hooks', 'vue')).toEqual([
      'src/hooks/**/*.{js,ts,vue}',
    ]);

    expect(resolveLayerFiles('hooks', 'react')).toEqual([
      'src/hooks/**/*.{js,jsx,ts,tsx}',
    ]);
  });

  it('substitutes {layer} in custom globs', () => {
    expect(resolveLayerFiles('services', 'auto', { layerFiles: ['lib/{layer}/**/*.ts'] }))
      .toEqual([
        'lib/services/**/*.ts',
      ]);
  });

  it('tolerates the spaces a hand-written placeholder carries', () => {
    // `{ layer }` is how a human writes it. Requiring the braces to hug the word
    // leaves the placeholder in the glob verbatim, and the layer's rules then
    // scope to a directory literally named `{ layer }` — every gate silently
    // matches nothing, and nothing in the output says why.
    expect(resolveLayerFiles('services', 'auto', { layerFiles: ['lib/{ layer }/**/*.ts'] }))
      .toEqual([
        'lib/services/**/*.ts',
      ]);
  });

  it('normalizes a multi-segment sourceRoot the same way relative-escape.ts does', () => {
    // Before this fix, defaultGlob string-concatenated the raw sourceRoot: a
    // normalized-but-not-bare-'.' form produced a double slash
    // ('./lib/app//components/**' → after the leading './' trim still
    // 'lib/app//...') that this rule's own emitted `files` glob carried into
    // every generated config — the site relative-escape.ts's dirSegments fix
    // never touched.
    expect(resolveLayerFiles('components', 'react', { sourceRoot: './lib/app/' })).toEqual([
      'lib/app/components/**/*.{js,jsx,ts,tsx}',
    ]);
  });

  it('normalizes a trailing-slash-only sourceRoot ("./") to no prefix at all', () => {
    expect(resolveLayerFiles('components', 'react', { sourceRoot: './' })).toEqual([
      'components/**/*.{js,jsx,ts,tsx}',
    ]);
  });

  it('keeps the single-segment cases byte-identical to before this fix', () => {
    // dirSegments('src').join('/') === 'src' and dirSegments('app').join('/')
    // === 'app' — the two cases the strict `sourceRoot === '.'` check already
    // got right, and this fix must not move.
    expect(resolveLayerFiles('components', 'react')).toEqual([
      'src/components/**/*.{js,jsx,ts,tsx}',
    ]);

    expect(resolveLayerFiles('components', 'react', { sourceRoot: 'app' })).toEqual([
      'app/components/**/*.{js,jsx,ts,tsx}',
    ]);
  });
});

describe('derivePackageRules · what counts as the same ownership', () => {
  it('merges owners of one package however their import lists are ordered', () => {
    // The dedup key sorts the import list, so two layers naming the same
    // primitives in a different order are ONE rule allowing both — not two
    // rules where each bans the other's layer.
    const rules = derivePackageRules([
      { name: 'a', does: 'x', owns: [{ package: 'vue', imports: ['ref', 'computed'] }] },
      { name: 'b', does: 'y', owns: [{ package: 'vue', imports: ['computed', 'ref'] }] },
    ]);

    expect(rules).toHaveLength(1);
    expect(rules[0].allowedIn).toEqual(['a', 'b']);

    // The exempt list is sorted into the key on the same footing.
    const exemptOrder = derivePackageRules([
      { name: 'a', does: 'x', owns: [{ package: 'lodash', exempt: ['a.ts', 'b.ts'] }] },
      { name: 'b', does: 'y', owns: [{ package: 'lodash', exempt: ['b.ts', 'a.ts'] }] },
    ]);

    expect(exemptOrder).toHaveLength(1);
    expect(exemptOrder[0].allowedIn).toEqual(['a', 'b']);
  });

  it('keys an absent list identically to an empty one', () => {
    const imports = derivePackageRules([
      { name: 'a', does: 'x', owns: [{ package: 'axios' }] },
      { name: 'b', does: 'y', owns: [{ package: 'axios', imports: [] }] },
    ]);

    expect(imports).toHaveLength(1);
    expect(imports[0].allowedIn).toEqual(['a', 'b']);

    const exempt = derivePackageRules([
      { name: 'a', does: 'x', owns: [{ package: 'zod' }] },
      { name: 'b', does: 'y', owns: [{ package: 'zod', exempt: [] }] },
    ]);

    expect(exempt).toHaveLength(1);
    expect(exempt[0].allowedIn).toEqual(['a', 'b']);
  });

  it('keeps two different exempt lists apart', () => {
    // Sorting the exempt list into the key only matters if the list is in the
    // key at all. Leaving it out merges these two into one rule whose exempt
    // list is whichever layer was seen first — so the other layer's exempt file
    // is no longer exempt, and a file the author excused starts failing lint.
    const rules = derivePackageRules([
      { name: 'a', does: 'x', owns: [{ package: 'lodash', exempt: ['legacy/a.ts'] }] },
      { name: 'b', does: 'y', owns: [{ package: 'lodash', exempt: ['legacy/b.ts'] }] },
    ]);

    expect(rules).toHaveLength(2);
    expect(rules.map((rule) => rule.exempt)).toEqual([['legacy/a.ts'], ['legacy/b.ts']]);
  });
});

describe('derivePackageRules', () => {
  const layers: LayerDef[] = [
    { name: 'contexts', does: '', owns: [{ package: 'react', imports: ['createContext'] }] },
    { name: 'hooks', does: '', owns: [{ package: 'react', imports: ['useContext'] }] },
    { name: 'services', does: '', owns: ['axios', { global: 'fetch' }] },
  ];

  it('groups by signature and skips globals', () => {
    const rules = derivePackageRules(layers);

    expect(rules).toHaveLength(3);
    expect(rules.map((r) => r.package).sort()).toEqual(['axios', 'react', 'react']);
  });

  it('merges the same package+imports across layers into one rule', () => {
    const rules = derivePackageRules([
      { name: 'a', does: '', owns: ['axios'] },
      { name: 'b', does: '', owns: ['axios'] },
    ]);

    expect(rules).toHaveLength(1);
    expect(rules[0].allowedIn).toEqual(['a', 'b']);
  });

  it('preserves a glob (pattern) package rule', () => {
    const rules = derivePackageRules([
      { name: 'x', does: '', owns: [{ package: '@scope/*', pattern: true }] },
    ]);

    expect(rules[0].pattern).toBe(true);
  });
});

describe('deriveGlobalRules', () => {
  it('collects globals and skips packages', () => {
    const rules = deriveGlobalRules([
      { name: 'services', does: '', owns: ['axios', { global: 'fetch' }, { global: 'WebSocket' }] },
    ]);

    expect(rules.map((r) => r.global)).toEqual(['fetch', 'WebSocket']);
    expect(rules[0].allowedIn).toEqual(['services']);
  });

  it('merges the same global owned by multiple layers', () => {
    const rules = deriveGlobalRules([
      { name: 'a', does: '', owns: [{ global: 'fetch' }] },
      { name: 'b', does: '', owns: [{ global: 'fetch' }] },
    ]);

    expect(rules).toHaveLength(1);
    expect(rules[0].allowedIn).toEqual(['a', 'b']);
  });
});

describe('buildStructuralPatterns', () => {
  it('emits the structural groups with forbidden layers and folder targets', () => {
    const groups = buildStructuralPatterns({
      layer: 'a',
      aliases: ['~app'],
      forbidden: ['b'],
      folderLayout: 'folder',
      folderTargets: ['c'],
    });

    // redundant-segments + same-layer + forbidden + deep-import
    expect(groups).toHaveLength(4);
    expect(groups.some((g) => g.group.includes('~app/b/**'))).toBe(true);
    // Deep-import bans name each folder-layout target, never a bare wildcard —
    // and the `../` ban is gone: depth-aware escapes live in the plugin rule.
    expect(groups.some((g) => g.group.includes('~app/c/*/**'))).toBe(true);
    expect(groups.some((g) => g.group.includes('~app/*/*/**'))).toBe(false);
    expect(groups.some((g) => g.group.includes('../**'))).toBe(false);
    expect(groups.some((g) => g.group.includes('../*/**'))).toBe(false);
    // No closed-world group (deferred to inspect); nothing bans the alias root.
    expect(groups.some((g) => g.group.includes('~app/**'))).toBe(false);
  });

  it('drops forbidden and deep-import groups for flat layout with none forbidden', () => {
    const groups = buildStructuralPatterns({
      layer: 'a',
      aliases: ['~app'],
      forbidden: [],
      folderLayout: 'flat',
    });

    // redundant-segments + same-layer
    expect(groups).toHaveLength(2);
    expect(groups.some((g) => g.group.includes('./../**'))).toBe(true);
    expect(groups.some((g) => g.group.includes('~app/*/*/**'))).toBe(false);
  });

  it('spells the same-layer replacement the layer\'s own layout allows', () => {
    // Both layouts ban the alias spelling for a sibling, and both point at the
    // relative one — but at different paths. A flat layer's siblings are files
    // beside you (`./X`); a folder layer's are one level up (`../X`), entry only.
    // The message is the whole fix, so handing a folder layer `./X` sends the
    // author to a path that does not exist, and handing a flat layer `../X`
    // sends them out of the layer.
    const sameLayer = (folderLayout: 'folder' | 'flat') =>
      buildStructuralPatterns({ layer: 'a', aliases: ['~app'], forbidden: [], folderLayout })
        .find((group) => group.group.includes('~app/a/**'))?.message;

    expect(sameLayer('flat')).toContain('Replace "~app/a/X" with "./X".');

    expect(sameLayer('folder')).toContain('Replace "~app/a/X" with "../X"');
    expect(sameLayer('folder')).toContain('what is behind the entry stays private');
  });
});

describe('buildPackagePatterns', () => {
  it('splits path rules from glob rules and messages named imports', () => {
    const { paths, patterns } = buildPackagePatterns([
      { package: 'axios', allowedIn: ['services'] },
      { package: 'react', imports: ['createContext'], allowedIn: ['contexts'] },
      { package: '@app/*', pattern: true, allowedIn: ['x'] },
    ]);

    expect(paths.map((p) => p.name)).toEqual(['axios', 'react']);
    expect(paths[1].message).toMatch(/createContext/);
    expect(patterns[0].group).toEqual(['@app/*']);
  });
});

describe('selfOnlyReexportSelector', () => {
  it('targets export declarations from the aliased target', () => {
    const selector = selfOnlyReexportSelector('~app', 'contexts');

    expect(selector).toContain('ExportNamedDeclaration');
    expect(selector).toContain('ExportAllDeclaration');
  });

  it('never puts a raw or escaped slash inside the regex literal (field #19)', () => {
    // esquery's regex literal ends at the first raw `/`, and pre-1.7
    // versions reject `\/` too — truncated pattern, ESLint crash on every
    // file of the layer. The separator must ride as `\u002F`.
    const selector = selfOnlyReexportSelector('~app', 'contexts');
    const [, regex] = selector.match(/\/(.*?)\/(?=\])/) ?? [];

    expect(regex).toBe('^~app\\u002Fcontexts\\u002F');
    expect(new RegExp(regex).test('~app/contexts/theme')).toBe(true);
    expect(new RegExp(regex).test('~app/contexts-x/theme')).toBe(false);
  });
});
