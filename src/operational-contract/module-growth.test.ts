import { describe, expect, it } from 'vitest';

import {
  MODULE_GROWTH_TITLE,
  renderModuleDecompositionSteps,
  renderModuleGrowthAuthority,
  renderModuleGrowthProtocol,
  renderModuleRunwayFact,
} from './module-growth';

const flat = (text: string) => text.replace(/\s+/g, ' ');

describe('module growth protocol', () => {
  const protocol = flat(renderModuleGrowthProtocol({ runway: false }, '##'));

  it('orders the requirement-design method from projection to real edges', () => {
    const milestones = [
      'Never derive a module from vocabulary',
      'route/page composition → the container/use-case responsibilities',
      'Treat each container/use-case responsibility as a module seed',
      'Merge related seeds; split only independent ones',
      'Keep domain-owned code with its owner',
      'Materialize Module → Layer → Unit only after ownership is decided',
      'Derive `dependsOn` from the resulting imports',
    ].map((claim) => protocol.indexOf(claim));

    expect(milestones.every((index) => index >= 0)).toBe(true);
    expect([...milestones].sort((a, b) => a - b)).toEqual(milestones);
  });

  it.each([
    'request noun', 'screen', 'route segment', 'hook', 'service', 'entity',
    'existing top-level folder',
  ])('rejects a module derived from a %s by itself', (source) => {
    expect(protocol).toMatch(new RegExp(`A [^.]*${source}[^.]* is not a module by itself`));
  });

  it('rejects one-module-per-noun decomposition and catch-all extraction', () => {
    expect(protocol).toContain('one module per screen, hook, service, entity, or noun is the wrong '
      + 'decomposition');

    expect(protocol).toContain('never a catch-all `shared`, `common`, or `core`');

    expect(protocol).toContain('Code with a clear domain owner stays in that module even when '
      + 'several modules consume it');
  });

  it('keeps the layer-first projection out of topology authority', () => {
    expect(protocol).toContain('The projection is analysis, not topology: never describe this '
      + 'repository as layer-first, never write a layer-first config, and never run '
      + '`blueprint init --topology` or a topology transformation to perform it.');
  });

  it('maps topology positions to the existing module-first contract', () => {
    expect(protocol).toContain('Its root files take the container position — the role a '
      + 'layer-first container plays, never an inner `containers` layer');

    expect(protocol).toContain('Route/page composition belongs to the reserved `app` module once '
      + 'routes exist.');
  });

  it('leaves inner layers, rules, and thresholds with the owner', () => {
    expect(protocol).toContain('Inner layers, rules, and thresholds are outside this protocol');
    expect(protocol).toContain('Never add an edge only to make a boundary check pass');
  });

  it('opens on the runway fact only when no domain module exists', () => {
    const runway = flat(renderModuleGrowthProtocol({ runway: true }, '###'));

    expect(runway.startsWith(`### ${MODULE_GROWTH_TITLE} `)).toBe(true);
    expect(runway).toContain(flat(renderModuleRunwayFact()));
    expect(protocol.startsWith(`## ${MODULE_GROWTH_TITLE} `)).toBe(true);
    expect(protocol).not.toContain('no domain module exists');
    expect(protocol).toContain('The declared modules are the current domain authority');
  });

  it('states the runway as intended rather than incomplete', () => {
    expect(flat(renderModuleRunwayFact())).toContain('The absence is intended, not incomplete '
      + 'adoption.');
  });

  it('shares the first five decomposition steps with authoring', () => {
    expect(renderModuleDecompositionSteps().map(flat))
      .toEqual(protocol.split(/ \d\. /).slice(1, 6).map((step) => step.trim()));
  });

  it('points the compact authority at the handbook and keeps the owner boundary', () => {
    const authority = flat(renderModuleGrowthAuthority('docs/handbook.md'));

    expect(authority).toContain('follow the module growth protocol in '
      + '[docs/handbook.md](docs/handbook.md)');

    expect(authority).toContain('never one module per screen, hook, service, entity, or request '
      + 'noun, and never a catch-all `shared`');

    expect(authority).toContain('Changing inner layers, rules, or thresholds is the owner\'s '
      + 'decision — say so and stop.');
  });
});
