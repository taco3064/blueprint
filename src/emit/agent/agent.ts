import type { Blueprint } from '../../config';
import {
  renderAgentLifecycle, renderConsumerFiles, withValidationErrorRendering,
} from '../../operational-contract';
import type { StackFacts } from '../lint';
import {
  renderBehavioral,
  renderChecklist,
  renderCompactContract,
  renderComponentShape,
  renderContext,
  renderHardRules,
  renderHeader,
  renderModuleGrowth,
  renderNaming,
  renderPlacement,
  renderPlaybook,
} from './sections';

export interface AgentContractOptions extends StackFacts {

  compact?: boolean;

  contractDoc?: string;
}

export function emitAgentContract(
  blueprint: Blueprint,
  options: AgentContractOptions = {},
): string {
  return withValidationErrorRendering(() => emitAgentContractUnchecked(blueprint, options));
}

function emitAgentContractUnchecked(
  blueprint: Blueprint,
  options: AgentContractOptions,
): string {
  const { compact, contractDoc, ...stack } = options;

  if (compact) {
    return [
      renderCompactContract(blueprint, stack, contractDoc),
      renderConsumerFiles(blueprint.architecture, '###'),
    ].filter(Boolean).join('\n\n') + '\n';
  }

  const { architecture, principles, rules } = blueprint;

  const sections = [
    renderHeader(),
    renderContext(blueprint),
    renderPlacement(architecture, {
      declaredFramework: blueprint.framework,
      framework: blueprint.framework === 'auto' ? stack.detectedFramework : blueprint.framework,
      severity: blueprint.emit?.lint?.severity,
    }),
    renderModuleGrowth(architecture),
    renderConsumerFiles(architecture, '###'),
    renderNaming(architecture.naming),
    renderHardRules(blueprint, stack),
    renderComponentShape(blueprint.componentShape),
    renderBehavioral(architecture, principles, rules),
    renderPlaybook(blueprint.playbook),
    renderChecklist(blueprint),
    renderAgentLifecycle('###'),
  ].filter(Boolean);

  return `${sections.join('\n\n')}\n`;
}
