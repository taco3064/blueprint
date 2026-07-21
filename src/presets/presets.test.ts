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

  it('merge an emit override over the day-1 CI default (batch 10)', () => {
    // Declaring the agent tool must not cost the one-line preset form — and
    // must not silently drop the CI workflow the way a spread override does.
    expect(reactPreset({ emit: { agents: ['claude'] } }).emit)
      .toEqual({ ci: 'github', agents: ['claude'] });

    // An explicit ci wins; the default only fills the gap.
    expect(vuePreset({ emit: { ci: 'none' } }).emit).toEqual({ ci: 'none' });

    expect(nextPreset({ emit: { agents: ['agents'] } }).emit)
      .toEqual({ ci: 'github', agents: ['agents'] });
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

  it('carry the ten governance principles, all behavioral', () => {
    const bp = vuePreset();

    expect(bp.principles).toHaveLength(10);
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

  it('carry the four-section playbook and render it into both artifacts', () => {
    const bp = vuePreset();
    const sections = bp.playbook ?? [];

    expect(sections.map((section) => section.title)).toEqual([
      'Data integrity & backend boundary',
      'Runtime load discipline',
      'Refactor discipline',
      'Design collaboration',
    ]);

    expect(sections.flatMap((section) => section.rules)).toHaveLength(18);

    expect(emitHandbook(bp)).toContain('## Working playbook');
    expect(emitAgentContract(bp)).toContain('- **Never fall back to fake data.**');
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
    expect(bp.architecture.module.layout).toBe('flat');

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
