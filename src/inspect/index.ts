export { runDeps } from './deps';
export type { DepsOptions, ModuleDeps } from './deps';
export { runDoctor } from './doctor';
export type { DoctorCheck, DoctorOptions, DoctorVerdict } from './doctor';
export { runInspect } from './inspect';
export type { InspectOptions } from './inspect';
export { runRules } from './rules';

export { analyze } from './analyze';
export { globToRegExp } from './filter';
export { resolveSegments, stripAlias } from './resolve';
export { scan } from './scan';

export { expectedCarriers } from './wiring';
export type { GateStatus, LayerBans, RulesOptions } from './rules';
export type { Finding, ImportRef, ScannedFile, ScanResult, Severity } from './types';
