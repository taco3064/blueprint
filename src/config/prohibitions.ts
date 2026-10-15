import type { Framework, LayerDef, MustNotCheck } from './types';
import { MUST_NOT_CAPABILITIES } from './capabilities';

export interface ProhibitionContext {
  framework?: Framework;
  severity?: 'error' | 'warn';
  parserCapabilities?: { framework?: boolean; typeReferences?: boolean; syntax?: boolean };
}

export interface ResolvedMustNotCheck {
  check: MustNotCheck;
  status: 'available' | 'unavailable';
  unavailableReason: string | null;
  limitations: string[];
}

export interface ResolvedProhibition {
  declarationSlot: number;
  layer: string;
  id: string | null;
  description: string;
  mode: 'review-only' | 'executable';
  status: 'review-only' | 'active' | 'partial' | 'unavailable';
  checks: ResolvedMustNotCheck[];
  enforcedBy: 'lint' | null;
  limitations: string[];
  reach: 'covered' | 'vacuous' | 'runway' | 'unmeasured';
  exempt: string[];
  severity: 'error' | 'warn';
  ruleId: 'blueprint/must-not';
}

export function resolveProhibitions(
  layer: LayerDef,
  context: ProhibitionContext = {},
  runway = false,
): ResolvedProhibition[] {
  return (layer.mustNot ?? []).map((entry, declarationSlot) => {
    const base = {
      declarationSlot,
      layer: layer.name,
      reach: runway ? 'runway' as const : 'unmeasured' as const,
      severity: context.severity ?? 'error',
      ruleId: 'blueprint/must-not' as const,
    };

    if (typeof entry === 'string') {
      return { ...base,
        id: null,
        description: entry,
        mode: 'review-only',
        status: 'review-only',
        checks: [],
        enforcedBy: null,
        limitations: [],
        exempt: [] };
    }

    const checks = entry.checks.map((check) => resolveCheck(check, context));
    const available = checks.filter((check) => check.status === 'available').length;

    return {
      ...base,
      id: entry.id,
      description: entry.description,
      mode: 'executable',
      status: available === checks.length ? 'active' : available > 0 ? 'partial' : 'unavailable',
      checks,
      enforcedBy: 'lint',
      limitations: [...new Set(checks.flatMap((check) => check.limitations))],
      exempt: [...(entry.exempt ?? [])],
    };
  });
}

function resolveCheck(check: MustNotCheck, context: ProhibitionContext): ResolvedMustNotCheck {
  let unavailableReason: string | null = null;

  if ('capability' in check) {
    const detector = MUST_NOT_CAPABILITIES[check.capability];

    if (detector.framework && context.framework !== detector.framework) {
      unavailableReason = `Requires resolved ${detector.framework} framework support.`;
    } else if ((detector.packageCalls || detector.jsx) && !frameworkParserAvailable(context)) {
      unavailableReason = 'Required framework parser support is unavailable.';
    }
  }

  if (requiresReferences(check) && context.parserCapabilities?.typeReferences === false) {
    unavailableReason = 'The active parser cannot expose required value and type reference spaces.';
  }

  if (syntaxUnavailable(context)) {
    unavailableReason = 'Required source syntax parser support is unavailable.';
  }

  return {
    check: { ...check },
    status: unavailableReason === null ? 'available' : 'unavailable',
    unavailableReason,
    limitations: checkLimitations(check),
  };
}

function syntaxUnavailable(context: ProhibitionContext): boolean {
  return context.parserCapabilities?.syntax === false;
}

function frameworkParserAvailable(context: ProhibitionContext): boolean {
  return context.parserCapabilities?.framework
    ?? (context.framework === 'react' || context.framework === 'vue');
}

function requiresReferences(check: MustNotCheck): boolean {
  return 'global' in check
    || ('capability' in check && Boolean(MUST_NOT_CAPABILITIES[check.capability].globals));
}

function checkLimitations(check: MustNotCheck): string[] {
  if ('capability' in check) {
    return [...MUST_NOT_CAPABILITIES[check.capability].limitations];
  }

  if ('call' in check) {
    return ['Project-declared syntactic call-name check, not semantic identity '
      + 'proof; unrelated terminal methods may match. No aliases, reassignment, '
      + 'wrappers, runtime-computed members, constructors, or Vue '
      + 'template-expression calls.'];
  }

  if ('global' in check) {
    return ['Unshadowed global references in value and supported type positions '
      + 'only; declarations, property keys, labels, strings, and local bindings '
      + 'do not match.'];
  }

  return [
    check.pattern
      ? 'Declared ownership/no-restricted-imports group glob; no package-family '
      + 'expansion.'
      : 'Exact package and slash-delimited subpaths; sibling package names do '
        + 'not match.',
    check.imports
      ? 'Exported symbols in static imports and re-exports, including aliases '
      + 'and type-only forms; no CommonJS/dynamic namespace identity, later '
      + 'property access, reassignment, or wrappers.'
      : 'Static imports and re-exports, including type-only forms, proven '
        + 'CommonJS require and dynamic-import strings; runtime-dependent sources '
        + 'remain unverified.',
  ];
}

export function prohibitionGateEvidence(input: {
  status: ResolvedProhibition['status'];
  severity: 'error' | 'warn';
  violation?: boolean;
  wiring: 'verified' | 'failed' | 'unverified';
}): { gate: 'passed' | 'failed' | 'unverified'; observation: boolean; affectsExit: boolean } {
  const blocking = input.violation === true && input.severity === 'error';
  const failed = blocking || input.wiring === 'failed';

  const uncertain = input.status === 'partial' || input.status === 'unavailable'
    || input.wiring === 'unverified';

  return {
    gate: failed ? 'failed' : uncertain ? 'unverified' : 'passed',
    observation: input.violation === true && input.severity === 'warn',
    affectsExit: failed,
  };
}
