import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { nextPreset, reactPreset, vuePreset } from './presets';
import { emitAgentContract } from '../emit/agent';
import { emitHandbook } from '../emit/docs';
import { emitLint } from '../emit/lint';
import type { Blueprint, LayerDef } from '../config';

function layer(blueprint: Blueprint, name: string): LayerDef {
  return blueprint.architecture.layers.find((entry) => entry.name === name)!;
}

describe('presets · shape', () => {
  it('produce valid blueprints with the canonical six layers', () => {
    for (const bp of [vuePreset(), reactPreset()]) {
      expect(bp.architecture.layers.map((entry) => entry.name)).toEqual([
        'pages',
        'containers',
        'components',
        'hooks',
        'contexts',
        'services',
      ]);
    }
  });

  it('return a fresh, independent object each call', () => {
    const a = vuePreset();
    const b = vuePreset();

    expect(a).not.toBe(b);

    a.architecture.layers.push({ name: 'extra', does: '' });

    expect(b.architecture.layers).toHaveLength(6);
  });

  it('apply name and alias options, defaulting the alias', () => {
    expect(vuePreset({ name: 'Acme' }).name).toBe('Acme');
    expect(vuePreset().name).toBeUndefined();
    expect(vuePreset({ alias: '@' }).architecture.alias).toBe('@');
    expect(vuePreset().architecture.alias).toBe('~app');
  });

  it('passes an emit override straight through', () => {
    // Declaring the agent tool must not cost the one-line preset form.
    expect(reactPreset({ emit: { agents: ['claude'] } }).emit)
      .toEqual({ agents: ['claude'] });

    // No emit override → no emit block; verification strategy is the adopter's.
    expect(vuePreset().emit).toBeUndefined();

    expect(nextPreset({ emit: { agents: ['agents'] } }).emit)
      .toEqual({ agents: ['agents'] });
  });

  it('bind framework primitives to the right layers', () => {
    const vue = vuePreset();

    expect(layer(vue, 'contexts').owns).toEqual([{ package: 'vue', imports: ['provide'] }]);
    expect(layer(vue, 'hooks').owns).toEqual([{ package: 'vue', imports: ['inject'] }, 'pinia']);

    const react = reactPreset();

    expect(layer(react, 'contexts').owns).toEqual([
      { package: 'react', imports: ['createContext'] },
    ]);

    expect(layer(react, 'hooks').owns).toEqual([
      { package: 'react', imports: ['useContext'] },
      'zustand',
    ]);
  });

  it('shape vue and react around the folder module', () => {
    for (const bp of [vuePreset(), reactPreset()]) {
      // Every layer, not most of them: a layer left flat is one whose modules
      // have no entry to hide behind, and only this list would show it.
      expect(bp.architecture.layers.map((l) => [l.name, l.layout ?? 'flat', l.entry ?? 'index']))
        .toEqual([
          ['pages', 'folder', 'index'],
          ['containers', 'folder', 'index'],
          ['components', 'folder', 'index'],
          ['hooks', 'folder', 'index'],
          ['contexts', 'folder', 'index'],
          ['services', 'folder', 'index'],
        ]);

      // Naming conventions reach the handbook and the agent contract verbatim.
      expect(bp.architecture.naming).toMatchObject({
        component: expect.stringContaining('PascalCase'),
        hook: expect.stringContaining('useX'),
        service: expect.stringContaining('snake_case'),
        context: expect.stringContaining('Provider'),
      });
    }
  });

  it('shape the next preset around its route tree', () => {
    const next = nextPreset();

    // The shape assertions above walk vue and react only, which left the third
    // preset's module shape, naming and primitives free to empty out. Flat is
    // the default, so this preset declares neither key on any layer.
    expect(next.architecture.layers.every((l) => l.layout === undefined && l.entry === undefined))
      .toBe(true);

    expect(next.architecture.naming?.hook).toContain('useX');
    expect(layer(next, 'hooks').owns).toEqual([{ package: 'react', imports: ['useContext'] }]);
  });

  it('spell out what each layer must not do, wherever a prohibition is declared', () => {
    // A mustNot line is a handbook prohibition that reaches the emitted docs
    // and the agent contract. An empty list is not a formatting detail — it is
    // a layer with no prohibition at all, a different architecture from the one
    // the preset claims to document.
    for (const bp of [vuePreset(), reactPreset(), nextPreset()]) {
      for (const entry of bp.architecture.layers) {
        if (entry.mustNot === undefined) continue;

        expect(entry.mustNot.length).toBeGreaterThan(0);
        expect(entry.mustNot.every((line) => line.trim().length > 0)).toBe(true);
      }
    }
  });

  it('carry the nine governance principles, all behavioral', () => {
    const bp = vuePreset();

    expect(bp.principles).toHaveLength(9);
    expect(bp.principles?.every((principle) => principle.land === 'claude')).toBe(true);
  });

  it('carry the seven component-shape axes with unique ids', () => {
    for (const bp of [vuePreset(), reactPreset()]) {
      const ids = (bp.componentShape ?? []).map((axis) => axis.id);

      expect(ids).toHaveLength(7);
      expect(new Set(ids).size).toBe(7);
      expect(ids[0]).toBe('ownership-inversion');
    }
  });

  it('gate deep watches for vue only; hook naming for both', () => {
    expect(vuePreset().rules?.deepWatch).toBe('error');
    expect(reactPreset().rules?.deepWatch).toBeUndefined();
    expect(vuePreset().rules?.usePrefix).toBe('error');
    expect(reactPreset().rules?.usePrefix).toBe('error');
  });

  it('carry the handbook CORE gates and custom-rule tiers', () => {
    const rules = vuePreset().rules ?? {};

    expect(rules.maxStatements).toEqual({ tier: 'warn', value: 15 });
    expect(rules.complexity).toEqual({ tier: 'warn', value: 12 });
    expect(rules.unusedVars).toBe('error');
    expect(rules.fixtureImports).toBe('error');
    expect(rules.testFilename).toBe('error');
    expect(rules.usePrefixReactivity).toBe('warn');
    expect(rules.typedefOnlyFile).toBe('warn');
  });

  it('declare the injected-plugin gates on every preset, error tier', () => {
    // statementsPerLine is what makes the maxLines gate above mean anything —
    // a line budget with no cap on line content is met by collapsing, so the
    // two must never drift apart across presets.
    for (const rules of [vuePreset().rules, reactPreset().rules, nextPreset().rules]) {
      expect(rules?.explicitAny).toBe('error');
      expect(rules?.codeStyle).toBe('error');
      expect(rules?.statementsPerLine).toBe('error');
      expect(rules?.statementPadding).toBe('error');
      expect(rules?.importBlock).toBe('error');
      expect(rules?.maxLines).toEqual({ tier: 'error', value: 400 });
    }
  });
});

describe('presets · enforcement (real ESLint)', () => {
  const config = [
    { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
    ...emitLint(vuePreset()),
  ];

  const linter = new Linter({ configType: 'flat' });

  function restricted(code: string, filename: string): string[] {
    return linter
      .verify(code, config, { filename })
      .map((message) => message.ruleId)
      .filter((id): id is string => id != null && id.startsWith('no-restricted-'));
  }

  const file = (layerName: string) => `src/${layerName}/Mod/Mod.ts`;

  it('bans the three tightened imports from the handbook', () => {
    expect(restricted('import x from "~app/contexts/Theme";', file('components'))).toContain(
      'no-restricted-imports',
    );

    expect(restricted('import x from "~app/services/api";', file('components'))).toContain(
      'no-restricted-imports',
    );

    expect(restricted('import x from "~app/services/api";', file('pages'))).toContain(
      'no-restricted-imports',
    );
  });

  it('allows the wired branch and spine imports', () => {
    expect(restricted('import x from "~app/contexts/Theme";', file('hooks'))).toEqual([]);
    expect(restricted('import x from "~app/services/api";', file('containers'))).toEqual([]);
    expect(restricted('import x from "~app/containers/Cart";', file('pages'))).toEqual([]);
  });

  it('lets hooks depend on contexts but not re-export it (selfOnly)', () => {
    expect(restricted('import { t } from "~app/contexts/Theme";', file('hooks'))).toEqual([]);

    expect(restricted('export { t } from "~app/contexts/Theme";', file('hooks'))).toContain(
      'no-restricted-syntax',
    );
  });

  it('gates deep watches and hook naming through the emitted config', () => {
    const ids = (code: string, filename: string) =>
      linter.verify(code, config, { filename }).map((message) => message.ruleId);

    expect(ids('watch(x, cb, { deep: true });', file('containers'))).toContain(
      'blueprint/no-deep-watch',
    );

    expect(ids('export function getCart() {}', file('hooks'))).toContain('blueprint/use-prefix');
  });
});

describe('presets · downstream emitters', () => {
  it('feed the Handbook and the agent contract without error', () => {
    const bp = reactPreset({ name: 'Portal' });

    expect(emitHandbook(bp)).toContain('## Architecture');
    expect(emitAgentContract(bp)).toContain('IMPORTABLE BY: containers, hooks (selfOnly).');
  });

  it('carry the three-section playbook and render it into both artifacts', () => {
    const bp = vuePreset();
    const sections = bp.playbook ?? [];

    expect(sections.map((section) => section.title)).toEqual([
      'Runtime load discipline',
      'Refactor discipline',
      'Design collaboration',
    ]);

    expect(sections.flatMap((section) => section.rules)).toHaveLength(14);

    expect(emitHandbook(bp)).toContain('## Working playbook');
    expect(emitAgentContract(bp)).toContain('- **Price every handler attached to a data source.**');
  });

  it('render the component-shape axes into both artifacts', () => {
    const bp = vuePreset();
    const handbook = emitHandbook(bp);
    const contract = emitAgentContract(bp);

    expect(handbook).toContain('## Component shape — 7 orthogonal axes');
    expect(handbook).toContain('### 4. Orchestration Shell — A page only orchestrates.');

    expect(contract).toContain('- **Pure Helpers ≠ Composables**');

    expect(contract).toContain(
      '- [ ] Changed units hold against every component-shape axis, judged one by one.',
    );
  });
});

describe('nextPreset', () => {
  it('makes the App-Router tree the top layer under src, with no fetch ownership', () => {
    const bp = nextPreset({ name: 'app', router: 'app', srcDir: true });

    expect(bp.framework).toBe('react');
    expect(bp.architecture.sourceRoot).toBe('src');
    expect(bp.architecture.alias).toBe('@');
    expect(bp.architecture.layers.map((l) => l.name)).toEqual(['app', 'components', 'hooks', 'lib']);
    expect(bp.architecture.layers.every((l) => l.layout === undefined)).toBe(true);

    // Server components fetch everywhere — fetch must not be owned by a layer.
    const owners = bp.architecture.layers.flatMap((l) => l.owns ?? []);

    expect(JSON.stringify(owners)).not.toContain('fetch');
  });

  it('defaults to the app router when none is given', () => {
    expect(nextPreset().architecture.layers[0].name).toBe('app');
  });

  it('uses the project root when srcDir is false', () => {
    expect(nextPreset({ router: 'app' }).architecture.sourceRoot).toBe('.');
  });

  it('declares both route trees for a migration project', () => {
    const names = nextPreset({ router: 'both', srcDir: true }).architecture.layers.map((l) => l.name);

    expect(names.slice(0, 2)).toEqual(['app', 'pages']);
  });

  it('emits a lint config whose layer globs honor the source root', () => {
    const rootConfig = emitLint(nextPreset({ router: 'app' })); // sourceRoot '.'
    const files = rootConfig.flatMap((entry) => entry.files ?? []);

    expect(files.some((glob) => glob.startsWith('app/'))).toBe(true);
    expect(files.some((glob) => glob.startsWith('src/'))).toBe(false);
  });
});

describe('every preset declares codeStyle at error tier', () => {
  // `init` announces on a fresh scaffold what `codeStyle` will demand — indent,
  // quotes, semicolons, width, ~68 rules — and does so without re-checking the rule,
  // because a generated config always comes from one of these presets. This is the
  // check that keeps that safe: a preset that stops declaring it turns this red rather
  // than leaving the note describing a gate the adopter does not have.
  it.each([
    ['vue', vuePreset({ name: 'p' })],
    ['react', reactPreset({ name: 'p' })],
    ['next', nextPreset({ router: 'app', name: 'p' })],
  ])('%s', (_name, blueprint) => {
    expect(blueprint.rules?.codeStyle).toBe('error');
  });
});
