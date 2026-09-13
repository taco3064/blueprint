import { renderSurveyReport } from '../operational-contract';
import type { SurveyResult } from './survey';

export function renderSurvey(result: SurveyResult): string {
  return renderSurveyReport(result);
}
