import { describe, expect, it } from 'vitest';

import type { ArchitectureDef, Blueprint } from '../config';
import {
  renderArchitecture,
  renderCompactContract,
  renderHardRules,
  renderPlacement,
} from '.';

function architecture(over: Partial<ArchitectureDef> = {}): ArchitectureDef {
  return {
    alias: '@app',
    sourceRoot: 'lib/client',
    layers: [
      { name: 'features', does: 'product behavior', layout: 'folder', entry: 'public' },
      { name: 'shared', does: 'shared code', layout: 'file' },
    ],
    ...over,
  };
}

describe('operational contract emitters', () => {
  it('renders custom source-root placement for layer-first and module-first facts', () => {
    expect(renderPlacement(architecture())).toContain('`lib/client/features/`');

    const moduleFirst = renderPlacement(architecture({
      modules: [
        { name: 'auth', does: 'authentication' },
        { name: 'shop', does: 'commerce', dependsOn: ['auth'] },
      ],
    }));

    expect(moduleFirst).toContain('`lib/client/auth/`');
    expect(moduleFirst).toContain('`lib/client/shop/features/`');
    expect(moduleFirst).toContain('DIRECT DEPENDENCIES: `auth`.');
  });

  it('renders consumer-derived paths and gate holders without resolving them itself', () => {
    const blueprint: Blueprint = {
      framework: 'react',
      architecture: architecture(),
      rules: { maxLines: { tier: 'error', value: 250 }, cycles: 'error' },
    };

    const gates = [
      { id: 'maxLines', setting: blueprint.rules!.maxLines, holder: 'lint' as const },
      { id: 'cycles', setting: blueprint.rules!.cycles, holder: 'inspect' as const },
    ];

    const output = renderCompactContract(blueprint, {
      handbook: 'architecture/team-contract.md',
      gates,
    });

    const hardRules = renderHardRules(blueprint, gates);

    expect(output).toContain(
      '[architecture/team-contract.md](architecture/team-contract.md)',
    );

    expect(output).toContain('`maxLines` = 250');
    expect(output).toContain('effective project-lint wiring is unverified');
    expect(output).toContain('`cycles` is diagnosed only when');

    expect(hardRules).toContain('`maxLines` = 250 is emitted but not yet verified alive');
    expect(hardRules).not.toContain('`maxLines` = 250 is diagnosed only when');
    expect(hardRules).toContain('`cycles` is diagnosed only when');
  });

  it('distinguishes layer-first and module-first compact topology facts', () => {
    const layer = renderCompactContract({
      framework: 'react', architecture: architecture(),
    }, { handbook: 'handbook.md', gates: [] });

    const module = renderCompactContract({
      framework: 'react',
      architecture: architecture({ modules: [{ name: 'auth', does: 'authentication' }] }),
    }, { handbook: 'handbook.md', gates: [] });

    expect(layer).toContain('declared Layer → Unit topology');
    expect(layer).not.toContain('Module flow:');
    expect(layer).not.toContain('module boundaries');
    expect(module).toContain('declared Module → Layer → Unit topology');
    expect(module).toContain('Module flow: each module may import itself');
    expect(module).toContain('module boundaries');
  });

  it('places the consumer-rendered diagram inside handbook semantics unchanged', () => {
    const diagram = '```mermaid\nflowchart LR\n  features --> shared\n```';
    const output = renderArchitecture(architecture(), diagram);

    expect(output).toContain(diagram);
    expect(output).toContain('| `features` | product behavior | — | — |');
  });
});
