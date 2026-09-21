import type { Blueprint } from '../../config';
import { readSetting } from '../../config';
import {
  renderBehavioral,
  renderChecklist,
  renderCompactContract as renderOperationalCompactContract,
  renderAgentComponentShape as renderComponentShape,
  renderContext,
  renderHardRules as renderOperationalHardRules,
  renderAgentHeader as renderHeader,
  renderAgentModuleGrowth as renderModuleGrowth,
  renderAgentNaming as renderNaming,
  renderPlacement,
  renderAgentPlaybook as renderPlaybook,
} from '../../operational-contract';
import type { AgentGateFact } from '../../operational-contract';
import { handbookPath } from '../docs';
import { enforcedBy, unavailableForEmit } from '../lint';
import type { StackFacts } from '../lint';

export function gateFacts(blueprint: Blueprint, stack: StackFacts = {}): AgentGateFact[] {
  const { architecture, framework, rules } = blueprint;

  return Object.entries(rules ?? {}).flatMap(([id, setting]) => {
    if (readSetting(setting).tier !== 'error'
      || unavailableForEmit(id, {
        framework,
        testFiles: architecture.testFiles,
        hasTypescript: stack.hasTypescript,
      }) !== null) {
      return [];
    }

    const holder = enforcedBy(id);

    return holder === 'lint' || holder === 'inspect'
      ? [{ id, setting, holder }]
      : [];
  });
}

export {
  renderBehavioral,
  renderChecklist,
  renderComponentShape,
  renderContext,
  renderHeader,
  renderModuleGrowth,
  renderNaming,
  renderPlacement,
  renderPlaybook,
};

export function renderCompactContract(
  blueprint: Blueprint,
  stack: StackFacts = {},
  contractDoc?: string,
): string {
  return renderOperationalCompactContract(blueprint, {
    gates: gateFacts(blueprint, stack),
    handbook: handbookPath(blueprint),
    lintIntegration: stack.lintIntegration,
    contractDoc,
  });
}

export function renderHardRules(blueprint: Blueprint, stack: StackFacts = {}): string {
  return renderOperationalHardRules(
    blueprint,
    gateFacts(blueprint, stack),
    stack.lintIntegration,
  );
}
