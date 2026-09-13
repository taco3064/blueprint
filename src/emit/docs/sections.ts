import type {
  ArchitectureDef,
  RuleSetting,
} from '../../config';
import {
  renderArchitecture as renderOperationalArchitecture,
  renderHandbookComponentShape as renderComponentShape,
  renderHandbookHeader as renderHeader,
  renderImportDiscipline,
  renderHandbookNaming as renderNaming,
  renderHandbookPlaybook as renderPlaybook,
  renderPrinciples,
  renderRules as renderOperationalRules,
  renderUnit,
} from '../../operational-contract';
import type { HandbookRuleFact } from '../../operational-contract';
import { enforcedBy, unavailableForEmit } from '../lint';
import type { EmitFacts } from '../lint';
import { emitFlowDiagram } from './diagram';

function ruleFacts(
  rules: Record<string, RuleSetting> | undefined,
  facts: EmitFacts,
): HandbookRuleFact[] {
  return Object.entries(rules ?? {}).map(([id, setting]) => {
    const unavailable = unavailableForEmit(id, facts);

    return {
      id,
      setting,
      enforcement: unavailable === null
        ? enforcedBy(id)
        : { unavailable },
    };
  });
}

export {
  renderComponentShape,
  renderHeader,
  renderImportDiscipline,
  renderNaming,
  renderPlaybook,
  renderPrinciples,
  renderUnit,
};

export function renderArchitecture(architecture: ArchitectureDef): string {
  return renderOperationalArchitecture(architecture, emitFlowDiagram(architecture));
}

export function renderRules(
  rules: Record<string, RuleSetting> | undefined,
  facts: EmitFacts = {},
): string {
  return renderOperationalRules(ruleFacts(rules, facts));
}
