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
  renderAgentNaming as renderNaming,
  renderPlacement,
  renderAgentPlaybook as renderPlaybook,
} from '../../operational-contract';
import type { AgentGateFact } from '../../operational-contract';
import {
  renderModuleFirstGrowthGuidance as renderOperationalModuleFirstGrowthGuidance,
} from '../../operational-contract/module-first-guidance';
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
  renderNaming,
  renderPlacement,
  renderPlaybook,
};

export function renderModuleFirstGrowthGuidance(blueprint: Blueprint): string {
  return renderOperationalModuleFirstGrowthGuidance(blueprint.architecture);
}

export function renderCompactContract(blueprint: Blueprint, stack: StackFacts = {}): string {
  const compact = renderOperationalCompactContract(blueprint, {
    gates: gateFacts(blueprint, stack),
    handbook: handbookPath(blueprint),
    lintIntegration: stack.lintIntegration,
  });

  const growth = renderModuleFirstGrowthGuidance(blueprint);

  return [compact, growth].filter(Boolean).join('\n\n');
}

export function renderHardRules(blueprint: Blueprint, stack: StackFacts = {}): string {
  return renderOperationalHardRules(
    blueprint,
    gateFacts(blueprint, stack),
    stack.lintIntegration,
  );
}
