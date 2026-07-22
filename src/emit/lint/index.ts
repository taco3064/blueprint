export { emitLint } from './lint';
export {
  DOC_ONLY_RULES,
  LINT_GATED_RULE_IDS,
  METRIC_GATES,
  PLUGIN_GATES,
  resolveLayerFiles,
  resolveTestFiles,
} from './patterns';
export type { GateSpec } from './patterns';
export type { EmitLintOptions, LintConfig, LintConfigEntry } from './types';
