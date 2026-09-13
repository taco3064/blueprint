import { DOC_ONLY_RULES, METRIC_GATES, PLUGIN_GATES } from '../emit/lint';
import { COMMAND_FILE } from '../project';
import type { ClaudeDirState } from '../project';
import { renderSurvey } from '../survey';
import type { SurveyResult } from '../survey';
import {
  renderAcceptanceGates as renderOperationalAcceptanceGates,
  renderResumePoint,
  renderRuleCatalog as renderOperationalRuleCatalog,
  renderSchemaSketch,
  renderSemantics,
  renderSurveyEvidence as renderOperationalSurveyEvidence,
} from '../operational-contract';

export { renderResumePoint, renderSchemaSketch, renderSemantics };

export function renderRuleCatalog(): string {
  return renderOperationalRuleCatalog({
    metricGates: METRIC_GATES.map(({ id, rule, fallback }) => ({ id, rule, fallback })),
    pluginGates: PLUGIN_GATES.map(({ id, emits, note }) => ({ id, emits, note })),
    documentationOnlyRules: DOC_ONLY_RULES.map(({ id, note }) => ({ id, note })),
  });
}

export function renderAcceptanceGates(
  claudeDir: ClaudeDirState,
  claudeLauncher: boolean,
): string {
  return renderOperationalAcceptanceGates(
    { ...claudeDir, commandFile: COMMAND_FILE },
    claudeLauncher,
  );
}

export function renderSurveyEvidence(survey: SurveyResult): string {
  return renderOperationalSurveyEvidence(renderSurvey(survey));
}
