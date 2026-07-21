import type { AgentTarget, Blueprint } from '../../config';
import { normalizeAgentEmit } from '../../config';
import { emitAgentContract } from './agent';

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
  /** Wrap the shared contract body in this tool's file format. */
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

/**
 * Distribute the agent contract across tool-specific files. Shared context
 * files (`merge` strategy — CLAUDE.md, AGENTS.md…) get the **compact** pointer
 * block: people maintain those documents, so the bulk lives behind links.
 * Tool-owned rule files (`own` — Cursor, Windsurf) get the full contract.
 * `defaultTargets` overrides the built-in default when `emit.agents` is
 * unset — `init --agent claude` narrows to the one tool actually in use.
 * Pure — decides paths and content, writes nothing.
 * @group Emitters
 * @example
 * for (const file of emitAgentFiles(blueprint)) {
 *   writeFileSync(file.path, file.content); // e.g. 'CLAUDE.md', '.cursor/rules/blueprint.mdc'
 * }
 */
export function emitAgentFiles(
  blueprint: Blueprint,
  defaultTargets?: AgentTarget[],
): AgentFile[] {
  const entries = normalizeAgentEmit(blueprint.emit?.agents, defaultTargets);

  if (!entries.length) return [];

  return entries.map(({ target, path }) => {
    const spec = TARGETS[target];
    const contract = emitAgentContract(blueprint, { compact: spec.strategy === 'merge' });

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
