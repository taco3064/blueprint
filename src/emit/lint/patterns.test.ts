import { describe, expect, it } from 'vitest';

import {
  buildPackagePatterns,
  DOC_ONLY_RULES,
  enforcedBy,
  PLUGIN_GATES,
  buildStructuralPatterns,
  derivePackageRules,
  deriveGlobalRules,
  resolveGovernedFiles,
  resolveLayerFiles,
  resolveModuleFiles,
  selfOnlyReexportSelector,
  toArray,
} from './patterns';
import type { ArchitectureDef, LayerDef } from '../../config';

describe('PLUGIN_GATES', () => {
  it('lists every conditional gate with an id, what it emits, and a scope note', () => {
    // `blueprint rules` prints this catalog and doctor reads it to decide which
    // gates should resolve. An entry emptied to `{}` puts an undefined id into
    // LINT_GATED_RULE_IDS and a blank row into both of those.
    expect(PLUGIN_GATES.map((gate) => gate.id)).toEqual([
      'unusedVars',
      'explicitAny',
      'codeStyle',
      'statementsPerLine',
      'statementPadding',
      'importBlock',
      'fixtureImports',
      'deepWatch',
      'usePrefix',
      'usePrefixReactivity',
      'testFilename',
      'typedefOnlyFile',
      'cycles',
    ]);

    for (const gate of PLUGIN_GATES) {
      expect(gate.emits).toBeTruthy();
      expect(gate.note).toBeTruthy();
    }
  });
});

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

/** An architecture carrying only what the resolvers read. */
function arch(over: Partial<ArchitectureDef> = {}): ArchitectureDef {
  return { alias: '~app', layers: [{ name: 'hooks', does: '' }], ...over };
}

describe('resolveLayerFiles', () => {
  it('defaults the glob from the framework', () => {
    expect(resolveLayerFiles('hooks', arch(), 'vue')).toEqual([
      'src/hooks/**/*.{js,ts,vue}',
    ]);

    expect(resolveLayerFiles('hooks', arch(), 'react')).toEqual([
      'src/hooks/**/*.{js,jsx,ts,tsx}',
    ]);
  });

  it('substitutes {layer} in custom globs', () => {
    expect(resolveLayerFiles('services', arch({ layerFiles: ['lib/{layer}/**/*.ts'] }), 'auto'))
      .toEqual(['lib/services/**/*.ts']);
  });

  it('tolerates the spaces a hand-written placeholder carries', () => {
    // `{ layer }` is how a human writes it. Requiring the braces to hug the word
    // leaves the placeholder in the glob verbatim, and the layer's rules then
    // scope to a directory literally named `{ layer }` — every gate silently
    // matches nothing, and nothing in the output says why.
    expect(resolveLayerFiles('services', arch({ layerFiles: ['lib/{ layer }/**/*.ts'] }), 'auto'))
      .toEqual(['lib/services/**/*.ts']);
  });

  it('tolerates the spaces a hand-written {module} carries', () => {
    // Same stakes as `{ layer }` next door: requiring the braces to hug the word
    // leaves the placeholder in the glob verbatim, so every net scopes to a
    // directory literally named `{ module }` and matches nothing — silent, and
    // green. A mutation sweep found this one; the `{layer}` case had a test and
    // this one did not.
    expect(resolveLayerFiles('hooks', arch({
      layerFiles: 'src/{ module }/{ layer }/**/*.ts',
      modules: [{ name: 'Fighter', does: '' }],
    }), 'auto')).toEqual(['src/Fighter/hooks/**/*.ts']);
  });

  it('expands the declared modules against the layer, never a wildcard', () => {
    // `src/*/hooks/**` would match `src/Figthter/hooks/x.ts` — a module nobody
    // declared, because of a typo. Coverage would count it inside the net while
    // no module-level rule governed it: half-governed and green.
    const modular = arch({
      modules: [
        { name: 'Fighter', does: '' },
        { name: 'Combat', does: '' },
      ],
    });

    expect(resolveLayerFiles('hooks', modular, 'react')).toEqual([
      'src/Fighter/hooks/**/*.{js,jsx,ts,tsx}',
      'src/Combat/hooks/**/*.{js,jsx,ts,tsx}',
    ]);

    expect(resolveLayerFiles('hooks', modular, 'react').join()).not.toContain('*/hooks');
  });

  it('skips a layers:false module — it has no layer folders to match', () => {
    const modular = arch({
      modules: [
        { name: 'app', does: '', layers: false },
        { name: 'Combat', does: '' },
      ],
    });

    expect(resolveLayerFiles('hooks', modular, 'react')).toEqual([
      'src/Combat/hooks/**/*.{js,jsx,ts,tsx}',
    ]);
  });

  it('substitutes {module} in a custom glob, per declared module', () => {
    const modular = arch({
      layerFiles: 'app/{module}/{layer}/**/*.ts',
      modules: [{ name: 'Fighter', does: '' }, { name: 'Combat', does: '' }],
    });

    expect(resolveLayerFiles('hooks', modular, 'auto')).toEqual([
      'app/Fighter/hooks/**/*.ts',
      'app/Combat/hooks/**/*.ts',
    ]);
  });

  it('honours a project-root source layout in both models', () => {
    expect(resolveLayerFiles('hooks', arch({ sourceRoot: '.' }), 'react')).toEqual([
      'hooks/**/*.{js,jsx,ts,tsx}',
    ]);

    expect(resolveLayerFiles(
      'hooks',
      arch({ sourceRoot: '.', modules: [{ name: 'app', does: '' }] }),
      'react',
    )).toEqual(['app/hooks/**/*.{js,jsx,ts,tsx}']);
  });
});

describe('resolveModuleFiles', () => {
  it('gives a layered module its root files only', () => {
    // The module root is the implicit top layer: `Fighter.tsx` and `index.ts`,
    // not the layer folders beneath them.
    expect(resolveModuleFiles({ name: 'Fighter', does: '' }, arch(), 'react')).toEqual([
      'src/Fighter/*.{js,jsx,ts,tsx}',
    ]);
  });

  it('gives a layers:false module the whole recursive net', () => {
    // Root-only here would leave `app/routes/Game.tsx` outside every net — the
    // wildcard defect wearing different clothes. It opts out of the layer
    // vocabulary, not out of governance.
    expect(resolveModuleFiles({ name: 'app', does: '', layers: false }, arch(), 'vue')).toEqual([
      'src/app/**/*.{js,ts,vue}',
    ]);
  });

  it('is built from sourceRoot and the name, never from a custom layerFiles', () => {
    // A custom layer path says nothing reliable about where the module root
    // sits; substituting a segment out of it would put the root and its own
    // layers in two different trees.
    const custom = arch({ layerFiles: 'packages/{module}/src/{layer}/**/*.ts', sourceRoot: 'app' });

    expect(resolveModuleFiles({ name: 'Fighter', does: '' }, custom, 'react')).toEqual([
      'app/Fighter/*.{js,jsx,ts,tsx}',
    ]);
  });
});

describe('resolveGovernedFiles', () => {
  it('is the layer nets alone for a flat config', () => {
    const flat = arch({ layers: [{ name: 'hooks', does: '' }, { name: 'services', does: '' }] });

    expect(resolveGovernedFiles(flat, 'react')).toEqual([
      'src/hooks/**/*.{js,jsx,ts,tsx}',
      'src/services/**/*.{js,jsx,ts,tsx}',
    ]);
  });

  it('adds every module root, so the module\'s own composition code is governed', () => {
    const modular = arch({
      layers: [{ name: 'hooks', does: '' }],
      modules: [
        { name: 'app', does: '', layers: false },
        { name: 'Fighter', does: '' },
      ],
    });

    expect(resolveGovernedFiles(modular, 'react')).toEqual([
      'src/Fighter/hooks/**/*.{js,jsx,ts,tsx}',
      'src/app/**/*.{js,jsx,ts,tsx}',
      'src/Fighter/*.{js,jsx,ts,tsx}',
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
      moduleLayout: 'folder',
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
      moduleLayout: 'flat',
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
    const sameLayer = (moduleLayout: 'folder' | 'flat') =>
      buildStructuralPatterns({ layer: 'a', aliases: ['~app'], forbidden: [], moduleLayout })
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

describe('enforcedBy — which machine holds a declared rule (field issue #52)', () => {
  it('separates lint gates from inspect gates from documentation', () => {
    // LINT_GATED_RULE_IDS answers "gated at all?"; the handbook needs "gated
    // by what?", because "`error` fails lint" is false for two of these.
    expect(enforcedBy('maxLines')).toBe('lint');
    expect(enforcedBy('codeStyle')).toBe('lint');
    expect(enforcedBy('importBlock')).toBe('lint');
    expect(enforcedBy('cycles')).toBe('inspect');
    expect(enforcedBy('deadCode')).toBe('docs');
    expect(enforcedBy('somethingNobodyDeclared')).toBe('docs');
  });

  it('stays in step with the catalog rather than hard-coding the exceptions', () => {
    // Every gate the catalog marks with a runtime resolves to that runtime,
    // and every other machine-gated id resolves to lint — so adding a
    // runtime-backed gate needs no second edit here.
    for (const gate of PLUGIN_GATES) {
      expect(enforcedBy(gate.id)).toBe(gate.runtime ?? 'lint');
    }

    for (const id of DOC_ONLY_RULES.map((rule) => rule.id)) {
      expect(enforcedBy(id)).toBe('docs');
    }
  });
});
