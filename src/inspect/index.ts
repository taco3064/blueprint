export { deriveAdoptionAssessment } from './adoption-assessment';
export { BASELINE_FILE } from './baseline';
export { runDeps } from './deps';
export { assessLintIntegration } from './adoption';
export type { DepsOptions, DepsResult, UnitDeps } from './deps';
export { runDoctor } from './doctor';
export type { DoctorCheck, DoctorOptions, DoctorVerdict, DoctorResult } from './doctor';
export { runInspect } from './inspect';
export type { InspectOptions, InspectResult } from './inspect';
export { runRules } from './rules';
export { measureProhibitions } from './prohibitions';
export type { ProhibitionFact } from './prohibitions';
export type { ProhibitionEvidence } from './prohibition-wiring';
export type { ProhibitionLintFinding } from './lint-runtime';
export { verifyTransformationObligation } from './transformation-obligation';
export type { TransformationObligationResult } from './transformation-obligation';

export { analyze, detectCycles } from './analyze';
export { dropTestFiles, globToRegExp } from './filter';
export { buildUnitGraph, positionKey, resolveSegments, stripAlias } from './resolve';
export { extractImports, importAnalysis, scan } from './scan';

export { expectedCarriers } from './wiring';
export type { GateStatus, LayerBans, RulesOptions } from './rules';
export type { Finding, ImportRef, ScannedFile, ScanResult, Severity } from './types';

export { collectArchitectureFacts } from './facts';
export type { ArchitectureDemand, ArchitectureFacts } from './facts';
export type { OutsideScopeEvidence, ScanWork } from './types';

export type {
  ModuleDependencies, ModuleDependencyRow, ModuleDependencyUncertainty, ObservedModuleEdge,
} from './module-dependencies-types';
