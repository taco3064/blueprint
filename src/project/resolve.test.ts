import { describe, expect, it } from 'vitest';

import { buildConfigSource, buildNextConfigSource, resolveBlueprint } from './resolve';
import { vuePreset } from '../presets';
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

describe('resolveBlueprint · the structure flag', () => {
  it('reaches the preset AND the config it writes — one run cannot say both', async () => {
    // Both outputs, in one assertion block, because they are the pair that can
    // disagree: a run reporting a modular blueprint while writing a flat config
    // leaves every later command reading a repo the run never described.
    const { blueprint, configSource } = await resolveBlueprint(
      '/repo',
      state({ projectName: 'acme' }),
      { structure: 'modular' },
    );

    expect(blueprint.architecture.modules?.map((module) => module.name)).toEqual(['app', 'common']);

    expect(blueprint.architecture.layers.map((layer) => layer.name))
      .toEqual(['components', 'hooks', 'contexts', 'services']);

    expect(configSource).toContain('structure: \'modular\'');
  });

  it('leaves flat alone — no modules, and the config today would write', async () => {
    const flat = await resolveBlueprint('/repo', state({ projectName: 'acme' }), {
      structure: 'flat',
    });

    const unasked = await resolveBlueprint('/repo', state({ projectName: 'acme' }), {});

    expect(flat.blueprint.architecture.modules).toBeUndefined();
    expect(flat.configSource).toBe(unasked.configSource);
  });

  it('does not re-decide over an existing config — no preset is reached at all', async () => {
    // The guard above returns before any preset call, and it has to stay that way:
    // the config's own `architecture.modules` is the answer, and a flag
    // contradicting it is not a tie to break.
    const existing = vuePreset({ name: 'existing' });

    const { blueprint, configSource } = await resolveBlueprint(
      '/repo',
      state({ hasConfig: true }),
      { structure: 'modular', loadConfig: () => Promise.resolve(existing) },
    );

    expect(blueprint).toBe(existing);
    expect(blueprint.architecture.modules).toBeUndefined();
    expect(configSource).toBeNull();
  });
});

describe('resolveBlueprint · the structure flag on a Next.js project', () => {
  const next = { hasNext: true, nextRouter: 'app' as const, framework: 'react' as const };

  it('refuses modular, naming what is missing and what to do instead', async () => {
    const refusal = resolveBlueprint('/repo', state(next), { structure: 'modular' });

    // The prefix carries the fact only this site knows — why a run that never
    // named Next resolved the Next preset…
    await expect(refusal).rejects.toThrow('--structure modular is not available here');
    await expect(refusal).rejects.toThrow('this repo has a Next.js route tree');
    // …and the shared refusal carries the cause and both ways out, so the CLI
    // and the preset API cannot drift into two different answers.
    await expect(refusal).rejects.toThrow('the modular model has no Next layer list');
    await expect(refusal).rejects.toThrow('Drop the option for the flat Next shape');
    await expect(refusal).rejects.toThrow('declare `architecture.modules` yourself');
  });

  it('accepts flat — it is the shape this preset already builds', async () => {
    // Refusing a request the preset already satisfies would leave a greenfield
    // Next repo with no answer that works once init starts requiring one.
    const flat = await resolveBlueprint('/repo', state(next), { structure: 'flat' });
    const unasked = await resolveBlueprint('/repo', state(next), {});

    expect(flat.blueprint.architecture.layers[0].name).toBe('app');
    expect(flat.configSource).toBe(unasked.configSource);
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

describe('buildConfigSource · structure', () => {
  it('writes the modular field, after the name and before emit', () => {
    // The whole call is read, not a fragment of it: the field has to be inside the
    // preset's options object and in a fixed place, or the emitted config either
    // does not parse or reads differently from every other one init writes.
    expect(buildConfigSource('vue', 'acme', ['claude'], 'modular'))
      .toContain(
        'export default vuePreset({ name: \'acme\', structure: \'modular\', '
        + 'emit: { agents: [\'claude\'] } });',
      );

    expect(buildConfigSource('react', undefined, undefined, 'modular'))
      .toContain('export default reactPreset({ structure: \'modular\' });');
  });

  it('writes nothing for flat — byte-identical to the call that never asked', () => {
    // `flat` is the preset default, so declaring it restates one. Self-referential
    // on purpose: whatever today's output is, the flag must not change it.
    expect(buildConfigSource('vue', 'acme', ['claude'], 'flat'))
      .toBe(buildConfigSource('vue', 'acme', ['claude']));

    expect(buildConfigSource('react', undefined, undefined, 'flat'))
      .toBe(buildConfigSource('react'));
  });
});

describe('buildNextConfigSource', () => {
  it('writes srcDir only when the routes are under src/', () => {
    // The generated config is what the repo keeps. A `srcDir: true` that is not
    // true points every layer glob at `src/` in a repo whose routes sit at the
    // root, and inspect then reports an empty net on a repo full of code.
    expect(buildNextConfigSource('app', false))
      .toContain('export default nextPreset({ router: \'app\' });');

    expect(buildNextConfigSource('pages', true))
      .toContain('export default nextPreset({ router: \'pages\', srcDir: true });');

    expect(buildNextConfigSource('both', true, 'shop', ['claude']))
      .toContain(
        'export default nextPreset({ name: \'shop\', router: \'both\', srcDir: true, '
        + 'emit: { agents: [\'claude\'] } });',
      );
  });
});
