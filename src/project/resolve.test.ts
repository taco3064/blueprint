import { describe, expect, it } from 'vitest';

import { buildConfigSource, buildNextConfigSource, resolveBlueprint } from './resolve';
import type { ProjectState } from './types';

function state(over: Partial<ProjectState> = {}): ProjectState {
  return {
    root: '/repo',
    framework: 'vue',
    packageManager: 'npm',
    hasConfig: false,
    hasEslintConfig: false,
    hasNext: false,
    hasNuxt: false,
    nextRouter: null,
    nextSrcDir: false,
    wiredEslintConfig: false,
    hasViteConfig: false,
    hasTypescript: true,
    tsconfigs: {},
    existingSrcDirs: [],
    missingDeps: [],
    dependencies: [],
    ...over,
  };
}

describe('resolveBlueprint · scaffolding from a preset', () => {
  it('carries the project name and the requested agent targets into the blueprint', async () => {
    // Both fields are spread in conditionally, and both are what the scaffolded
    // config then declares. A dropped name leaves the handbook titled after
    // nothing; dropped agents make `init --agent claude` emit the contract this
    // run but declare nothing, so the next plain init grows the second contract
    // back — field issue #5's chicken-and-egg.
    const { blueprint } = await resolveBlueprint(
      '/repo',
      state({ projectName: 'acme' }),
      { scaffoldAgents: ['claude'] },
    );

    expect(blueprint.name).toBe('acme');
    expect(blueprint.emit?.agents).toEqual(['claude']);
  });

  it('leaves both out when the project offers neither', async () => {
    const { blueprint } = await resolveBlueprint('/repo', state(), {});

    expect(blueprint.name).toBeUndefined();
    expect(blueprint.emit?.agents).toBeUndefined();
  });

  it('picks the preset the framework names, not whichever comes first', async () => {
    const vue = await resolveBlueprint('/repo', state({ framework: 'vue' }), {});
    const react = await resolveBlueprint('/repo', state({ framework: 'react' }), {});

    expect(vue.blueprint.framework).toBe('vue');
    expect(react.blueprint.framework).toBe('react');

    // And the rule sets differ: `deepWatch` is a Vue-only gate, so the wrong
    // preset either declares a rule that can never fire or drops one that can.
    expect(vue.blueprint.rules?.deepWatch).toBeDefined();
    expect(react.blueprint.rules?.deepWatch).toBeUndefined();
  });
});

describe('resolveBlueprint · the Next.js route tree', () => {
  const next = { hasNext: true, nextRouter: 'app' as const, framework: 'react' as const };

  it('takes the Next preset only when a route tree was actually found', async () => {
    // `next` in the dependencies without a detected route tree is not enough to
    // know where the routes live. Falling into the Next preset there declares
    // `app/` as the top layer of a repo that may have `pages/` instead, and
    // every route file lands outside the layer nets.
    const routeless = await resolveBlueprint(
      '/repo',
      state({ hasNext: true, nextRouter: null, framework: 'react' }),
      {},
    );

    expect(routeless.blueprint.architecture.layers.map((layer) => layer.name))
      .not.toContain('app');

    const detected = await resolveBlueprint('/repo', state(next), {});

    expect(detected.blueprint.architecture.layers[0].name).toBe('app');
  });

  it('carries the name, the agents, and the source root through the Next preset', async () => {
    const { blueprint } = await resolveBlueprint(
      '/repo',
      state({ ...next, projectName: 'shop', nextSrcDir: true }),
      { scaffoldAgents: ['claude', 'cursor'] },
    );

    expect(blueprint.name).toBe('shop');
    expect(blueprint.emit?.agents).toEqual(['claude', 'cursor']);
    expect(blueprint.architecture.sourceRoot).toBe('src');
  });

  it('roots the layers at the repo root when the routes are not under src/', async () => {
    const { blueprint } = await resolveBlueprint('/repo', state({ ...next }), {});

    expect(blueprint.architecture.sourceRoot).toBe('.');
    expect(blueprint.emit?.agents).toBeUndefined();
  });
});

describe('buildConfigSource', () => {
  it('names the preset the framework asks for and omits absent fields', () => {
    expect(buildConfigSource('vue')).toContain('import { vuePreset } from \'@kekkai/blueprint\';');
    expect(buildConfigSource('vue')).toContain('export default vuePreset();');
    expect(buildConfigSource('react')).toContain('export default reactPreset();');

    expect(buildConfigSource('vue', 'acme', ['claude']))
      .toContain('export default vuePreset({ name: \'acme\', emit: { agents: [\'claude\'] } });');
  });
});

describe('buildNextConfigSource', () => {
  it('writes srcDir only when the routes are under src/', () => {
    // The generated config is what the repo keeps. A `srcDir: true` that is not
    // true points every layer glob at `src/` in a repo whose routes sit at the
    // root, and inspect then reports an empty net on a repo full of code.
    expect(buildNextConfigSource({ router: 'app', srcDir: false }))
      .toContain('export default nextPreset({ router: \'app\' });');

    expect(buildNextConfigSource({ router: 'pages', srcDir: true }))
      .toContain('export default nextPreset({ router: \'pages\', srcDir: true });');

    expect(buildNextConfigSource({ router: 'both', srcDir: true }, 'shop', ['claude']))
      .toContain(
        'export default nextPreset({ name: \'shop\', router: \'both\', srcDir: true, '
        + 'emit: { agents: [\'claude\'] } });',
      );
  });
});
