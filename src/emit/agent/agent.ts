import type { Blueprint } from '../../config';
import type { StackFacts } from '../lint';
import {
  renderBehavioral,
  renderChecklist,
  renderCompactContract,
  renderComponentShape,
  renderContext,
  renderHardRules,
  renderHeader,
  renderNaming,
  renderPlacement,
  renderPlaybook,
} from './sections';

export interface AgentContractOptions extends StackFacts {
  /**
   * Emit the compact pointer block (one screen: project facts + links to the
   * generated handbook and the packaged discipline document) instead of the
   * full contract. This is what shared context files (CLAUDE.md, AGENTS.md)
   * receive — dumping the full contract into a document people maintain by
   * hand is noise; tool-owned rule files still take the full version.
   */
  compact?: boolean;
}

/**
 * Compile a Blueprint into an agent operating contract (markdown). Where the
 * Handbook (S2) explains for humans, this is terse, imperative, and loaded
 * into an agent's context every turn. Pure and deterministic.
 *
 * Uses `##` headings (no `#`) so Bootstrap (S5) can inject it into an existing
 * CLAUDE.md, or write it standalone under its own title.
 * @group Emitters
 * @example
 * const markdown = emitAgentContract(blueprint); // `##` sections, injectable
 */
export function emitAgentContract(
  blueprint: Blueprint,
  options: AgentContractOptions = {},
): string {
  // Rest, not a re-listed field: the stack facts pass through untouched, so a fact
  // added to `StackFacts` reaches both renderers without a second edit here.
  const { compact, ...stack } = options;

  if (compact) {
    return `${renderCompactContract(blueprint, stack)}\n`;
  }

  const { architecture, principles, rules } = blueprint;

  const sections = [
    renderHeader(),
    renderContext(blueprint),
    renderPlacement(architecture),
    renderNaming(architecture.naming),
    renderHardRules(blueprint, stack),
    renderComponentShape(blueprint.componentShape),
    renderBehavioral(architecture, principles, rules),
    renderPlaybook(blueprint.playbook),
    renderChecklist(blueprint),
  ].filter(Boolean);

  return `${sections.join('\n\n')}\n`;
}
