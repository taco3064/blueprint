import { describe, expect, it } from 'vitest';

import type { Blueprint } from '../../config';
import { reactPreset } from '../../presets';
import { renderConsumerFiles } from '../../operational-contract';
import { emitHandbook } from '../docs';
import { emitAgentContract } from './agent';

const surfaces = [
  ['handbook', emitHandbook, '##'],
  ['full Agent', emitAgentContract, '###'],
  ['compact Agent',
    (blueprint: Blueprint) => emitAgentContract(blueprint, { compact: true }), '###'],
] as const;

describe.each(surfaces)('%s consumer guidance delivery', (_name, emit, heading) => {
  it('delivers the registered contract with no inferred file inventory', () => {
    const blueprint = reactPreset({ modules: [] });

    blueprint.architecture.consumerFiles = ['.storybook/preview.ts', 'tools/**/*.ts'];

    expect(emit(blueprint)).toContain(renderConsumerFiles(blueprint.architecture, heading));
  });

  it('leaves omitted and empty configurations byte-identical', () => {
    const blueprint = reactPreset({ modules: [] });
    const before = emit(blueprint);

    blueprint.architecture.consumerFiles = [];

    expect(emit(blueprint)).toBe(before);
    expect(before).not.toContain('External consumers');
    expect(before).toBe(`${before.trimEnd()}\n`);
  });
});
