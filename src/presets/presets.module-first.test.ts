import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { reactPreset, vuePreset } from './presets';
import { resolveArchitecture } from '../config';
import type { Blueprint } from '../config';
import { emitLint } from '../emit/lint';

const factories = [
  ['react', reactPreset],
  ['vue', vuePreset],
] as const;

function withoutArchitecture({ architecture: _architecture, ...rest }: Blueprint) {
  return rest;
}

describe('presets · module-first projection', () => {
  it.each(factories)('%s keeps layer-first when modules is omitted', (_name, preset) => {
    const blueprint = preset({ name: 'shop' });

    expect('modules' in blueprint.architecture).toBe(false);
    expect(resolveArchitecture(blueprint.architecture).topology).toBe('layer-first');
  });

  it.each(factories)('%s opens an empty runway from modules: []', (_name, preset) => {
    const blueprint = preset({ name: 'shop', modules: [] });
    const resolved = resolveArchitecture(blueprint.architecture);

    expect(blueprint.architecture.modules).toEqual([]);
    expect(resolved.topology).toBe('module-first');
    expect(resolved.moduleRunway).toBe(true);
    expect(resolved.modules).toEqual([]);
  });

  it.each(factories)('%s moves pages and containers to module positions', (_name, preset) => {
    const layers = preset({ modules: [] }).architecture.layers;

    expect(layers.map((layer) => layer.name))
      .toEqual(['components', 'hooks', 'contexts', 'services']);

    expect(layers.find((layer) => layer.name === 'contexts')?.allowedImporters).toEqual([
      { layer: 'hooks', selfOnly: true, description: 'Context only' },
    ]);

    expect(layers.find((layer) => layer.name === 'services')?.allowedImporters)
      .toEqual(['hooks', 'contexts']);
  });

  it.each(factories)('%s keeps every other layer contract verbatim', (_name, preset) => {
    const layerFirst = preset().architecture.layers;
    const moduleFirst = preset({ modules: [] }).architecture.layers;

    for (const layer of moduleFirst) {
      const canonical = layerFirst.find((entry) => entry.name === layer.name)!;

      expect({ ...layer, allowedImporters: null })
        .toEqual({ ...canonical, allowedImporters: null });
    }
  });

  it.each(factories)('%s preserves the complete canonical governance', (_name, preset) => {
    const options = { name: 'shop', alias: '~shop', emit: { agents: ['claude' as const] } };
    const layerFirst = preset(options);
    const moduleFirst = preset({ ...options, modules: [] });

    expect(withoutArchitecture(moduleFirst)).toEqual(withoutArchitecture(layerFirst));
    expect(moduleFirst.architecture.alias).toBe('~shop');
    expect(moduleFirst.architecture.naming).toEqual(layerFirst.architecture.naming);
  });

  it('keeps the Vue-only deep-watch gate on the runway', () => {
    expect(vuePreset({ modules: [] }).rules?.deepWatch).toBe('error');
    expect(reactPreset({ modules: [] }).rules?.deepWatch).toBeUndefined();
  });

  it('passes declared modules through as module-first authority', () => {
    const modules = [
      { name: 'catalog', does: 'Product discovery.' },
      { name: 'checkout', does: 'Checkout flow.', dependsOn: ['catalog'] },
    ];

    const resolved = resolveArchitecture(reactPreset({ modules }).architecture);

    expect(resolved.modules.map((module) => module.name)).toEqual(['catalog', 'checkout']);
    expect(resolved.moduleRunway).toBe(false);
  });
});

describe('presets · module-first enforcement (real ESLint)', () => {
  const linter = new Linter({ configType: 'flat' });

  const blueprint = vuePreset({
    modules: [
      { name: 'catalog', does: 'Product discovery.' },
      { name: 'checkout', does: 'Checkout flow.', dependsOn: ['catalog'] },
    ],
  });

  const config = [
    { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
    ...emitLint(blueprint),
  ];

  function ruleIds(code: string, filename: string): string[] {
    return linter
      .verify(code, config, { filename })
      .map((message) => message.ruleId)
      .filter((id): id is string => id !== null
        && (id.startsWith('no-restricted-') || id.startsWith('blueprint/')));
  }

  it('keeps the canonical inner-layer bans inside a module', () => {
    const component = 'src/checkout/components/Cart/Cart.ts';
    const hook = 'src/checkout/hooks/cart/cart.ts';

    expect(ruleIds('import x from "~app/checkout/services/api";', component))
      .toContain('no-restricted-imports');

    expect(ruleIds('import x from "~app/checkout/contexts/Cart";', hook)).toEqual([]);

    expect(ruleIds('export { x } from "~app/checkout/contexts/Cart";', hook))
      .toContain('no-restricted-syntax');
  });

  it('gives the module root the container position', () => {
    const root = 'src/checkout/CheckoutScreen.ts';

    expect(ruleIds('import x from "~app/checkout/services/api";', root)).toEqual([]);
    expect(ruleIds('import x from "~app/catalog/components/List";', root)).toEqual([]);
    expect(ruleIds('import x from "axios";', root)).toContain('no-restricted-imports');
    expect(ruleIds('watch(x, cb, { deep: true });', root)).toContain('blueprint/no-deep-watch');
  });

  it('holds the module DAG and hook naming', () => {
    const upstream = 'src/catalog/components/List/List.ts';

    expect(ruleIds('import x from "~app/checkout/hooks/useCart";', upstream))
      .toContain('no-restricted-imports');

    expect(ruleIds('export function getCart() {}', 'src/checkout/hooks/getCart/getCart.ts'))
      .toContain('blueprint/use-prefix');
  });

  it('emits a runway config ESLint accepts, with no entry governing zero files', () => {
    const runway = emitLint(vuePreset({ modules: [] }));

    expect(runway.filter((entry) => entry.files !== undefined && entry.files.length === 0))
      .toEqual([]);

    expect(() => linter.verify('export const main = 1;', runway, { filename: 'src/main.ts' }))
      .not.toThrow();
  });
});
