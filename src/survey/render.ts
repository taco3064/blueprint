import { renderSurveyReport } from '../operational-contract';
import type { OperationalText } from '../operational-contract';
import type { SurveyResult } from './survey';

export function renderSurvey(result: SurveyResult): OperationalText {
  return renderSurveyReport(result);
}
