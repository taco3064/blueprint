import type { AgentTarget } from '../config';
import {
  buildConfigSource,
  buildNextConfigSource,
  CONFIG_FILE,
  readTexts,
} from '../project';
import type { ProjectState } from '../project';
import type { ArchitectureTopology } from './topology';

export function observePristineScaffold(
  root: string,
  state: ProjectState,
): ArchitectureTopology | null {
  const text = readTexts(root, [CONFIG_FILE])[CONFIG_FILE];

  const agentVariants: (AgentTarget[] | undefined)[] = [undefined, ['claude'], ['agents']];

  const candidates = (['layer-first', 'module-first'] as const).flatMap((topology) =>
    (['vue', 'react'] as const).flatMap((framework) =>
      agentVariants.flatMap((agents) => [
        {
          topology,
          source: buildConfigSource(framework, { name: state.projectName, agents, topology }),
        },
        { topology, source: buildConfigSource(framework, { agents, topology }) },
      ]),
    ),
  );

  // Stryker disable next-line ConditionalExpression: null router cannot match a scaffold.
  if (state.nextRouter) {
    for (const agents of agentVariants) {
      const next = { router: state.nextRouter, srcDir: state.nextSrcDir };

      candidates.push(
        { topology: 'layer-first', source: buildNextConfigSource(next, state.projectName, agents) },
        { topology: 'layer-first', source: buildNextConfigSource(next, undefined, agents) },
      );
    }
  }

  return candidates.find((candidate) => candidate.source === text)?.topology ?? null;
}
