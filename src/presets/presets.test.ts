import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { reactPreset, vuePreset } from './presets';
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
