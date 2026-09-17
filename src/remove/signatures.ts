import { GENERATED_ESLINT_BANNER } from '../project';
import { renderAgentHeader, renderHandbookHeader } from '../operational-contract';

export const HANDBOOK_MARK = renderHandbookHeader(undefined).split('\n')[2];

const CONTRACT_MARK = renderAgentHeader().split('\n')[0];

export function carriesBlueprintSignature(text: string): boolean {
  return text.startsWith(GENERATED_ESLINT_BANNER)
    || text.includes(HANDBOOK_MARK)
    || text.includes(CONTRACT_MARK);
}
