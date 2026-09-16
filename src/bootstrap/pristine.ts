import type { AgentTarget } from '../config';
import {
  buildConfigSource,
  buildNextConfigSource,
  CONFIG_FILE,
  readTexts,
} from '../project';
import type { ProjectState } from '../project';
import type { ArchitectureTopology } from './topology';

export interface PristineScaffold {
  topology: ArchitectureTopology;
}

export function observePristineScaffold(
  root: string,
  state: ProjectState,
): PristineScaffold | null {
  const text = readTexts(root, [CONFIG_FILE])[CONFIG_FILE];
  const agentVariants: (AgentTarget[] | undefined)[] = [undefined, ['claude'], ['agents']];

  for (const framework of ['vue', 'react'] as const) {
    for (const agents of agentVariants) {
      const layerFirst = [
        buildConfigSource(framework, state.projectName, agents),
        buildConfigSource(framework, undefined, agents),
      ];

      if (layerFirst.includes(text)) {
        return { topology: 'layer-first' };
      }

      const moduleFirst = [
        buildConfigSource(framework, state.projectName, agents, 'module-first'),
        buildConfigSource(framework, undefined, agents, 'module-first'),
      ];

      if (moduleFirst.includes(text)) {
        return { topology: 'module-first' };
      }
    }
  }

  // Stryker disable next-line ConditionalExpression: null router cannot match a scaffold.
  if (state.nextRouter) {
    for (const agents of agentVariants) {
      const next = { router: state.nextRouter, srcDir: state.nextSrcDir };
      const candidates = [
        buildNextConfigSource(next, state.projectName, agents),
        buildNextConfigSource(next, undefined, agents),
      ];

      if (candidates.includes(text)) {
        return { topology: 'layer-first' };
      }
    }
  }

  return null;
}
