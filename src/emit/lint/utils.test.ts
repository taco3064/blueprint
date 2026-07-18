import { describe, expect, it } from 'vitest';

import {
  buildPackagePatterns,
  buildStructuralPatterns,
  derivePackageRules,
  deriveGlobalRules,
  resolveLayerFiles,
  selfOnlyReexportSelector,
  toArray,
} from './utils';
import type { LayerDef } from '../../config/types';

describe('toArray', () => {
  it('wraps a string and passes an array through', () => {
    expect(toArray('a')).toEqual(['a']);
    expect(toArray(['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('resolveLayerFiles', () => {
  it('defaults the glob from the framework', () => {
    expect(resolveLayerFiles('hooks', undefined, 'vue')).toEqual([
      'src/hooks/**/*.{js,ts,vue}',
    ]);

    expect(resolveLayerFiles('hooks', undefined, 'react')).toEqual([
      'src/hooks/**/*.{js,jsx,ts,tsx}',
    ]);
  });

  it('substitutes {layer} in custom globs', () => {
    expect(resolveLayerFiles('services', ['lib/{layer}/**/*.ts'], 'auto')).toEqual([
      'lib/services/**/*.ts',
    ]);
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
  it('emits the structural groups for folder layout with forbidden layers', () => {
    const groups = buildStructuralPatterns({
      layer: 'a',
      aliases: ['~app'],
      forbidden: ['b'],
      moduleLayout: 'folder',
    });

    // relative + upper-level + same-layer + forbidden + deep-import
    expect(groups).toHaveLength(5);
    expect(groups.some((g) => g.group.includes('../*/**'))).toBe(true);
    expect(groups.some((g) => g.group.includes('~app/b/**'))).toBe(true);
    expect(groups.some((g) => g.group.includes('~app/*/*/**'))).toBe(true);
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

    // relative + upper-level + same-layer
    expect(groups).toHaveLength(3);
    expect(groups.some((g) => g.group.includes('../**'))).toBe(true);
    expect(groups.some((g) => g.group.includes('~app/*/*/**'))).toBe(false);
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
});
