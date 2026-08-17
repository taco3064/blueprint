export { runDeps } from './deps';
export type { DepsOptions, ModuleDeps } from './deps';
export { runDoctor } from './doctor';
export type { DoctorCheck, DoctorOptions } from './doctor';
export { runInspect } from './inspect';
export type { InspectOptions } from './inspect';
export { runRules } from './rules';
// The scan and the verdicts read off it. Exported because `bootstrap` runs both
// over the tree it is about to write into, and reaching them by deep path is
// what the entry rule bans.
export { analyze } from './analyze';
export { scan } from './scan';
// Which carrier plugins THIS blueprint needs. Exported for `impact` rather than
// copied — a gate-to-carrier table that exists twice goes out of step.
export { expectedCarriers } from './wiring';
export type { GateStatus, LayerBans, ModuleBans, RulesOptions } from './rules';
export type { Finding, Severity } from './types';
