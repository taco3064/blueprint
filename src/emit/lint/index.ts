export { emitLint } from './lint';
export {
  DOC_ONLY_RULES,
  enforcedBy,
  FRAMEWORK_EXTS,
  LINT_GATED_RULE_IDS,
  METRIC_GATES,
  PLUGIN_GATES,
  resolveLayerFiles,
  resolveTestFiles,
  unavailableForEmit,
} from './patterns';
export type { GateSpec } from './patterns';
export type {
  EmitFacts,
  EmitLintOptions,
  LintConfig,
  LintConfigEntry,
  StackFacts,
} from './types';
