import nodePath from 'node:path';

import type { AgentTarget, Blueprint } from '../../config';
import { normalizeAgentEmit } from '../../config';
import { withValidationErrorRendering } from '../../operational-contract';
import { emitAgentContract } from './agent';
import type { StackFacts } from '../lint';

/**
 * How a target's file relates to user content. `merge` — a shared context
 * file the user may hand-edit; inject the contract between markers. `own` —
 * a generated rules file wholly owned by the blueprint; overwrite it.
 */
export type AgentFileStrategy = 'merge' | 'own';

/** One agent-contract file to distribute. */
export interface AgentFile {
  target: AgentTarget;
  /** Project-relative path to write. */
  path: string;
  strategy: AgentFileStrategy;
  /** The contract, wrapped for this target (frontmatter where required). */
  content: string;
}

interface TargetSpec {
  path: string;
  strategy: AgentFileStrategy;

  wrap?: (contract: string, blueprint: Blueprint) => string;
}

const TARGETS: Record<AgentTarget, TargetSpec> = {
  claude: { path: 'CLAUDE.md', strategy: 'merge' },
  agents: { path: 'AGENTS.md', strategy: 'merge' },
  gemini: { path: 'GEMINI.md', strategy: 'merge' },
  copilot: { path: '.github/copilot-instructions.md', strategy: 'merge' },
  cursor: {
    path: '.cursor/rules/blueprint.mdc',
    strategy: 'own',
    wrap: (contract, blueprint) =>
      frontmatter(
        [`description: "${describe(blueprint)}"`, 'alwaysApply: true'],
        contract,
      ),
  },
  windsurf: {
    path: '.windsurf/rules/blueprint.md',
    strategy: 'own',
    wrap: (contract) => frontmatter(['trigger: always_on'], contract),
  },
};

export function defaultAgentPaths(): Pick<AgentFile, 'target' | 'path' | 'strategy'>[] {
  return (Object.entries(TARGETS) as [AgentTarget, TargetSpec][]).map(([target, spec]) => ({
    target,
    path: spec.path,
    strategy: spec.strategy,
  }));
}

/**
 * Distribute the agent contract across tool-specific files. Shared context files
 * (`merge`) get the compact pointer block, since people maintain those documents;
 * tool-owned rule files (`own`) get the full contract. `defaultTargets` overrides
 * the built-in default when `emit.agents` is unset; `facts` carries evidence no
 * Blueprint holds, including lint integration and the package-install root.
 * Pure — writes nothing.
 * @group Emitters
 * @example
 * for (const file of emitAgentFiles(blueprint)) {
 *   writeFileSync(file.path, file.content); // e.g. 'CLAUDE.md', '.cursor/rules/blueprint.mdc'
 * }
 */
export function emitAgentFiles(
  blueprint: Blueprint,
  defaultTargets?: AgentTarget[],
  facts: StackFacts & { packageRoot?: string } = {},
): AgentFile[] {
  return withValidationErrorRendering(() => emitAgentFilesUnchecked(
    blueprint,
    defaultTargets,
    facts,
  ));
}

function emitAgentFilesUnchecked(
  blueprint: Blueprint,
  defaultTargets: AgentTarget[] | undefined,
  facts: StackFacts & { packageRoot?: string },
): AgentFile[] {
  const { packageRoot = '.', ...stack } = facts;
  const entries = normalizeAgentEmit(blueprint.emit?.agents, defaultTargets);

  return entries.map(({ target, path }) => {
    const spec = TARGETS[target];

    const contractDoc = nodePath.posix.relative(
      nodePath.posix.dirname(path ?? spec.path),
      nodePath.posix.join(packageRoot, 'node_modules/@kekkai/blueprint/agent-contract.md'),
    );

    const contract = emitAgentContract(blueprint, {
      ...stack,
      compact: spec.strategy === 'merge',
      contractDoc,
    });

    return {
      target,
      path: path ?? spec.path,
      strategy: spec.strategy,
      content: spec.wrap ? spec.wrap(contract, blueprint) : contract,
    };
  });
}

function frontmatter(fields: string[], body: string): string {
  return ['---', ...fields, '---', '', body].join('\n');
}

function describe(blueprint: Blueprint): string {
  return `${(blueprint.name ?? 'Project').replace(/"/g, '\\"')} architecture contract`;
}
