import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

export type OutsideScopeView
  = | { status: 'not-requested' }
    | { status: 'not-applicable'; reason: string }
    | { status: 'complete' | 'partial'; inventoryMode: string;
      limitations: string[]; fallbackReason?: string; }
      | { status: 'unavailable'; inventoryMode: string; reason: string };

export function renderOutsideScopeAnalysis(fact: OutsideScopeView): OperationalText | undefined {
  if (fact.status === 'not-applicable') {
    return undefined;
  }

  if (fact.status === 'not-requested') {
    return operationalText('Application scope was not requested; no closed-world conclusion '
      + 'is available. Collect full architecture facts before accepting conformance.');
  }

  if (fact.status === 'unavailable') {
    return operationalText(`Application scope is unavailable (${fact.inventoryMode}): ${fact.reason}. `
      + 'Restore source inventory access and rerun verification before accepting conformance.');
  }

  const fallback = fact.inventoryMode === 'filesystem-fallback'
    ? ' Repository visibility is unavailable; filesystem fallback inventories all supported '
    + 'outside source under the scanner exclusions and may cost more. '
    + `Reason: ${fact.fallbackReason}. Restore Git visibility to use bounded inventory.`
    : '';

  const limitations = fact.status === 'partial'
    ? ` Unsettled evidence: ${fact.limitations.join('; ')}. Resolve these limitations and rerun `
    + 'verification; a baseline cannot certify incomplete application scope.'
    : '';

  return operationalText(`Application scope: ${fact.status} (${fact.inventoryMode}).`
    + fallback + limitations);
}

export function renderOutsideScopeDoctorCheck(fact: OutsideScopeView): {
  label: string; ok: boolean; detail: string;
} | undefined {
  const detail = renderOutsideScopeAnalysis(fact);

  if (detail === undefined) {
    return undefined;
  }

  return { label: 'Application source scope', ok: fact.status === 'complete', detail };
}

export function renderOutsideScopeError(kind: 'inventory' | 'not-requested'): OperationalText {
  return operationalText(kind === 'inventory'
    ? 'Git outside-source inventory could not be collected.'
    : 'Application-scope analysis requires outside-scope evidence.');
}

export function renderOutsideScopeOutput(output: string, scope: OutsideScopeView): OperationalText {
  return operationalText([output, renderOutsideScopeAnalysis(scope)]
    .filter((entry) => entry !== undefined).join('\n'));
}
