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

  compact?: boolean;
}

export function emitAgentContract(
  blueprint: Blueprint,
  options: AgentContractOptions = {},
): string {
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
