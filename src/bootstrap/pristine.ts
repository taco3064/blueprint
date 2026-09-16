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

interface PristineCandidate extends PristineScaffold {
  source: string;
}

const AGENT_VARIANTS: (AgentTarget[] | undefined)[] = [undefined, ['claude'], ['agents']];

function frameworkCandidates(state: ProjectState): PristineCandidate[] {
  return (['vue', 'react'] as const).flatMap((framework) =>
    AGENT_VARIANTS.flatMap((agents) => [
      {
        topology: 'layer-first' as const,
        source: buildConfigSource(framework, state.projectName, agents),
      },
      {
        topology: 'layer-first' as const,
        source: buildConfigSource(framework, undefined, agents),
      },
      {
        topology: 'module-first' as const,
        source: buildConfigSource(framework, state.projectName, agents, 'module-first'),
      },
      {
        topology: 'module-first' as const,
        source: buildConfigSource(framework, undefined, agents, 'module-first'),
      },
    ]),
  );
}

function nextCandidates(state: ProjectState): PristineCandidate[] {
  // Stryker disable next-line ConditionalExpression: null router cannot match a scaffold.
  if (!state.nextRouter) {
    return [];
  }

  const next = { router: state.nextRouter, srcDir: state.nextSrcDir };

  return AGENT_VARIANTS.flatMap((agents) => [
    {
      topology: 'layer-first' as const,
      source: buildNextConfigSource(next, state.projectName, agents),
    },
    {
      topology: 'layer-first' as const,
      source: buildNextConfigSource(next, undefined, agents),
    },
  ]);
}

export function observePristineScaffold(
  root: string,
  state: ProjectState,
): PristineScaffold | null {
  const text = readTexts(root, [CONFIG_FILE])[CONFIG_FILE];

  if (text === null) {
    return null;
  }

  const match = [...frameworkCandidates(state), ...nextCandidates(state)]
    .find((candidate) => candidate.source === text);

  return match ? { topology: match.topology } : null;
}
