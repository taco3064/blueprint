import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { reactPreset, vuePreset } from './main';
import { emitAgentContract } from '../emit/agent';
import { emitHandbook } from '../emit/docs';
import { emitLint } from '../emit/lint';
import type { Blueprint, LayerDef } from '../config/types';

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
});

describe('presets · downstream emitters', () => {
  it('feed the Handbook and the agent contract without error', () => {
    const bp = reactPreset({ name: 'Portal' });

    expect(emitHandbook(bp)).toContain('## Architecture');
    expect(emitAgentContract(bp)).toContain('IMPORTABLE BY: containers, hooks (selfOnly).');
  });
});
