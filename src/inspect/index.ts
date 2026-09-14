export { runDeps } from './deps';
export { assessLintIntegration } from './adoption';
export type { DepsOptions, UnitDeps } from './deps';
export { runDoctor } from './doctor';
export type { DoctorCheck, DoctorOptions, DoctorVerdict } from './doctor';
export { runInspect } from './inspect';
export type { InspectOptions } from './inspect';
export { runRules } from './rules';
export { verifyTransformationObligation } from './transformation-obligation';
export type { TransformationObligationResult } from './transformation-obligation';

export { analyze, detectCycles } from './analyze';
export { dropTestFiles, globToRegExp } from './filter';
export { buildUnitGraph, positionKey, resolveSegments, stripAlias } from './resolve';
export { importAnalysis, scan } from './scan';

export { expectedCarriers } from './wiring';
export type { GateStatus, LayerBans, RulesOptions } from './rules';
export type { Finding, ImportRef, ScannedFile, ScanResult, Severity } from './types';
