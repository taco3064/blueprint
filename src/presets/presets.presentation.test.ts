import { describe, expect, it } from 'vitest';

import { nextPreset, reactPreset, vuePreset } from './presets';
import { emitAgentContract } from '../emit/agent';
import { emitHandbook } from '../emit/docs';

const responsibilities = [
  'renders or composes props, inputs, or a prepared view model',
  'formats display and reports user intent through callbacks/events',
  'Feature-private and single-consumer presenters are components',
  'Ephemeral interaction state (open/closed, tabs, focus, input drafts) is allowed',
  'when it does not coordinate the application use case',
  'Components do not perform application IO, sequence workflows, or decide '
  + 'application-level branches',
  'Reuse informs shared/public promotion, not component classification',
];

describe.each([reactPreset, vuePreset])('presentation role through both topologies', (preset) => {
  describe.each([undefined, [{ name: 'babyoasis', does: 'nearby room selection' }]])(
    'modules = %j',
    (modules) => {
      it.each(responsibilities)('preserves the decision: %s', (responsibility) => {
        const blueprint = preset(modules === undefined ? {} : { modules });

        const component = blueprint.architecture.layers.find(
          (layer) => layer.name === 'components',
        )!;

        expect(component.does).toContain(responsibility);

        for (const output of [emitHandbook(blueprint), emitAgentContract(blueprint)]) {
          expect(output).toContain(component.does);
          expect(output).toContain(responsibility);
          expect(output).not.toContain('Reusable, presentational UI.');
        }
      });

      it('preserves forbidden responsibilities and consumes customized authority', () => {
        const blueprint = preset(modules === undefined ? {} : { modules });

        const component = blueprint.architecture.layers.find(
          (layer) => layer.name === 'components',
        )!;

        const canonical = component.does;

        expect(component.mustNot).toEqual(['call services', 'touch the router', 'own app state']);

        component.does = 'Project-owned presentation contract';

        for (const output of [emitHandbook(blueprint), emitAgentContract(blueprint)]) {
          expect(output).toContain(component.does);
          expect(output).not.toContain(canonical);
        }
      });
    },
  );

  it('keeps application/use-case state with the coordinator', () => {
    const containers = preset().architecture.layers.find((layer) => layer.name === 'containers')!;

    expect(containers.does).toContain('owns application/use-case state');
    expect(containers.does).toContain('calls services, drives navigation');
  });
});

it('preserves Next.js route/shared-component semantics', () => {
  expect(nextPreset().architecture.layers.find((layer) => layer.name === 'components')!.does)
    .toBe('Reusable UI, shared across routes.');
});
