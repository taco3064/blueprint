import { describe, expect, it } from 'vitest';

import {
  buildPackagePatterns,
  DOC_ONLY_RULES,
  enforcedBy,
  PLUGIN_GATES,
  buildStructuralPatterns,
  derivePackageRules,
  deriveGlobalRules,
  resolveLayerFiles,
  resolveTestFiles,
  selfOnlyReexportSelector,
  toArray,
  unavailableGate,
  unreachedTestGlobs,
} from './patterns';
import type { LayerDef } from '../../config';

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

describe('unreachedTestGlobs — every declared entry measured against the tree', () => {
  const dead = [{ glob: '**/*.test.{ts', matched: 0 }];

  it('names the entry that reaches nothing, and leaves the verdict to the owner', () => {
    const why = unreachedTestGlobs(dead);

    // The glob has an address, so it is quoted rather than described.
    expect(why).toContain('`**/*.test.{ts`');
    expect(why).toContain('no file here matches');
    // The consequence, in the same line as the cause — this is why a red appears
    // against files the author believed were exempt. Bounded to what the run read,
    // because a glob can point where the scan never went and this sentence would
    // then be speaking for files it never saw.
    expect(why).toContain('nothing this run read is exempt');
    expect(why).toContain('no scanned file is dropped from the analysis');
    // Both resolutions and no guess between them: the two repos this can be — one
    // that mistyped a glob, one whose tests have not landed — are the same
    // measurement, so it says so and ends in the owner's call.
    expect(why).toContain('look identical from here');
    expect(why).toContain('fix the glob');
    expect(why).toContain('the exemption arms itself when a file matches');
    expect(why).toContain('the owner\'s call');
  });

  it('names only the dead entries of a net that still reaches files', () => {
    // The shape a truncated second extension list has, and the reason the measurement
    // is per entry: judged as a union this net is healthy and the typo is invisible.
    const why = unreachedTestGlobs([
      { glob: '**/*.test.ts', matched: 4 },
      { glob: '**/*.spec.{ts', matched: 0 },
    ]);

    expect(why).toContain('`**/*.spec.{ts`');
    expect(why).not.toContain('`**/*.test.ts`');
  });

  it('names each dead entry when more than one is', () => {
    expect(unreachedTestGlobs([
      { glob: '**/*.test.{ts', matched: 0 },
      { glob: '**/*.spec.{ts', matched: 0 },
    ])).toContain('`**/*.test.{ts`, `**/*.spec.{ts`');
  });

  it.each([
    ['scripts/**', 'outside the source root `src`'],
    ['src/**/*.css', 'a file type this scan does not read (`.css`)'],
    ['dist/**', 'a directory this scan never descends into (`dist`)'],
  ])('states, for %s, the class the scan settles rather than handing it back', (glob, why) => {
    // Criterion 18's three stating fixtures, on this field. `unreached` is filled in by
    // `testFileReach`, because `emit/lint` sits below `inspect` and cannot ask.
    const said = unreachedTestGlobs([{ glob, matched: 0, unreached: why }]) as string;

    expect(said).toContain(`\`${glob}\` — ${why}`);
    // Neither of the two it is NOT: handing this back asserts one of them is true.
    expect(said).not.toContain('look identical from here');
    expect(said).not.toContain('fix the glob');
    expect(said).not.toContain('owner\'s call');
  });

  it('hands back the entry the scan could have reached, and says nothing extra', () => {
    // Criterion 18's fourth fixture on this field, and the byte the sibling ruling
    // turns on: with nothing settled, this sentence is what it has printed since stage
    // 2 — no naming, no clause. `inspect` / `rules` / `deps` all print it verbatim.
    expect(unreachedTestGlobs([{ glob: '**/*.test.{ts', matched: 0 }]))
      .toBe('`architecture.testFiles` — no file here matches `**/*.test.{ts`, so nothing '
        + 'this run read is exempt through that part of the net: no scanned file is dropped '
        + 'from the analysis. That is this scan\'s reach, not a verdict on the entry — '
        + '`emit/lint` writes these globs into the `testFilename` entry\'s own `files` too, '
        + 'so where that gate is on it is emitted all the same and governs whatever they '
        + 'do match. A mistyped glob and a test convention whose files '
        + 'have not landed look identical from here — fix the glob, or leave it and the '
        + 'exemption arms itself when a file matches; which one applies is the owner\'s call');
  });

  it('neither classifies nor hands back an entry beginning with a negation', () => {
    // `globToRegExp` has no `!` branch, so this side measures a directory literally named
    // `!src` and `outsideScanReach` answers for it — correctly, on blueprint's reading.
    // ESLint reads a leading `!` in a config glob as a negation, so that reading is not
    // the adopter's. Both other shapes assert something unavailable here: the
    // classification speaks for what the linter will do, the hand-back for a typo or
    // unlanded files. `unreached` is supplied to prove the decline outranks it.
    const said = unreachedTestGlobs([
      { glob: '!src/**/*.css', matched: 0, unreached: 'outside the source root `src`' },
    ]) as string;

    expect(said).toContain('`!src/**/*.css`');
    expect(said).toContain('not read the same way on both sides');
    expect(said).toContain('neither classifies it nor hands it back');

    expect(said).not.toContain('Measured:');
    expect(said).not.toContain('look identical from here');
    expect(said).not.toContain('fix the glob');
  });

  it('keeps a negated entry out of both clauses while a sibling still gets one', () => {
    // The mixed net: the decline must not swallow the entry beside it, and that entry
    // must not drag the negated one into a verdict.
    const said = unreachedTestGlobs([
      { glob: '!src/**/*.css', matched: 0, unreached: 'outside the source root `src`' },
      { glob: 'src/**/*.gen.ts', matched: 0 },
    ]) as string;

    expect(said).toContain('which leaves `src/**/*.gen.ts` undecided');
    expect(said).toContain('neither classifies it nor hands it back: `!src/**/*.css`');
    expect(said).not.toContain('Measured:');
  });

  it('splits a net holding both, and names the undecided half only then', () => {
    // The second listing earns its place only once the entries have been split — with
    // one class the opening clause already lists every dead entry.
    const said = unreachedTestGlobs([
      { glob: 'scripts/**', matched: 0, unreached: 'outside the source root `src`' },
      { glob: '**/*.test.{ts', matched: 0 },
    ]) as string;

    expect(said).toContain('Measured: `scripts/**` — outside the source root `src`.');
    expect(said).toContain('which leaves `**/*.test.{ts` undecided');
    expect(said).toContain('owner\'s call');
  });

  it('says nothing when there is no declaration to be wrong about', () => {
    // The list is built from the DECLARED globs, so an absent field and `[]` both
    // arrive here as no entries. `[]` has its own arm in `unavailableGate`.
    expect(unreachedTestGlobs([])).toBeNull();
  });

  it('says nothing to a caller that did not measure', () => {
    // The two pure emitters. Absent means "not measured", never "reaches nothing" —
    // guessing here is what would move what they emit.
    expect(unreachedTestGlobs(undefined)).toBeNull();
  });

  it('says nothing when every entry reaches a file', () => {
    expect(unreachedTestGlobs([{ glob: '**/*.test.ts', matched: 3 }])).toBeNull();
  });
});

/**
 * The two roles `emit/lint` gives these globs, and the consequence each one carries. Its
 * own block because the half above it is a different question — which CLASS a dead entry
 * is in — and the per-function line cap is what the split answers to.
 */
describe('unreachedTestGlobs · what the emitted config still does with a dead entry', () => {
  it('accounts for BOTH roles the emitted config gives these globs', () => {
    // `emit/lint` puts `testFiles` in two places, and a note naming only one of them
    // contradicts the gate row beside it: that row reports `testFilename` armed — the
    // entry is emitted whatever these globs reach — while the sentence would explain
    // only why nothing is exempt.
    const said = unreachedTestGlobs([
      { glob: 'scripts/**', matched: 0, unreached: 'outside the source root `src`' },
    ]) as string;

    // The `files` role: the gate's own scope IS this net.
    expect(said).toContain('the `testFilename` entry\'s own `files`');
    expect(said).toContain('governs whatever they do match');

    // The `ignores` role, which is this field's own consequence and not its sibling's.
    // `layerFilesIgnore` is copied into an `ignores` carrying no `files` — repo-wide,
    // and the tail that says so would claim a reach these globs do not get there.
    expect(said).toContain('scoped rather than repo-wide');
    expect(said).toContain('sits beside a `files`');
    expect(said).not.toContain('still applies it wherever it does match');
  });

  it('carries the `files` role on every class, not only the ones it can classify', () => {
    // The bridge is unconditional because the gate is: a hand-back and a decline emit
    // the same entry a classified one does. Hung off `outOfScanReachClause` instead, the
    // commonest dead glob of all — a typo inside the source root — would print the gate
    // as armed with nothing beside it saying why.
    for (const dead of [
      [{ glob: '**/*.test.{ts', matched: 0 }],
      [{ glob: '!**/*.gen.ts', matched: 0 }],
    ]) {
      expect(unreachedTestGlobs(dead)).toContain('governs whatever they do match');
      expect(unreachedTestGlobs(dead)).not.toContain('Measured:');
    }
  });
});

/**
 * The one clause in this sentence that speaks for the WHOLE net rather than for the dead
 * part of it, so it is the one that moves with what the rest of the net reached. Its own
 * block for the same reason the one above it has one: the per-function line cap.
 */
describe('unreachedTestGlobs · what the dead entries cost the run printing them', () => {
  it('leaves the drop with the rest of the net, where the rest of the net made it', () => {
    // `**/*.test.ts` matched, so a file this run scanned really is dropped from the
    // analysis — by the run printing the sentence.
    const said = unreachedTestGlobs([
      { glob: '**/*.test.ts', matched: 1 },
      { glob: '**/*.spec.{ts', matched: 0 },
    ]) as string;

    expect(said).toContain('nothing this run read is exempt through that part of the net: '
      + 'the scanned files dropped from the analysis are the ones the rest of the net '
      + 'matched');

    expect(said).not.toContain('no scanned file is dropped');

    // "The rest", and no further: the entries this sentence gives an address to are the
    // ones an adopter can fix, and the working one is not among them.
    expect(said).not.toContain('`**/*.test.ts`');
  });

  it('says nothing was dropped where the whole net is dead, and nothing was', () => {
    // The other direction, on the same dead entry: with nothing beside it to do the
    // dropping, the run analysed everything it scanned and the wording does not move.
    expect(unreachedTestGlobs([{ glob: '**/*.spec.{ts', matched: 0 }]))
      .toContain('that part of the net: no scanned file is dropped from the analysis');
  });
});

describe('unavailableGate · testFilename against the declaration', () => {
  const stack = { framework: 'react', hasTypescript: true };

  // Every shape that is NOT the empty list, including the three the scan cannot speak
  // for: a `{` with no `}`, a net pointing outside the source root, a leading `!`, and
  // the built-in pair written out by hand. With the gate declared, `emitLint` emits the
  // rule beside its `files` for all of them, so a verdict here would be a claim about
  // the tree wearing the clothes of a claim about the config.
  it.each([
    ['a glob that compiles to a literal brace', ['**/*.test.{ts']],
    ['a net outside the source root', ['tests/**/*.ts']],
    ['an entry this scan and ESLint read differently', ['!**/*.gen.ts']],
    ['the resolved defaults written out', resolveTestFiles(undefined)],
    ['one glob as a bare string', '**/*.mytest.js'],
  ] as [string, string | string[]][])('leaves the gate open for %s', (_case, testFiles) => {
    expect(unavailableGate('testFilename', { ...stack, testFiles })).toBeNull();
  });

  it('closes it on the empty list — the testFiles shape emitLint drops', () => {
    expect(unavailableGate('testFilename', { ...stack, testFiles: [] }))
      .toContain('`architecture.testFiles: []` exempts nothing');
  });

  it('says nothing for an undeclared field, and nothing for any other gate', () => {
    expect(unavailableGate('testFilename', { ...stack, testFiles: undefined })).toBeNull();

    // Scoped to this gate: nothing else keys on the test globs, in either direction.
    expect(unavailableGate('maxLines', { ...stack, testFiles: [] })).toBeNull();
    expect(unavailableGate('maxLines', { ...stack, testFiles: ['**/*.test.{ts'] })).toBeNull();
  });
});
