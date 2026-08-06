export { runDeps } from './deps';
export type { DepsOptions, ModuleDeps } from './deps';
export { runDoctor } from './doctor';
export type { DoctorCheck, DoctorOptions } from './doctor';
export { runInspect } from './inspect';
export type { InspectOptions } from './inspect';
export { runRules } from './rules';
// Which carrier plugins THIS blueprint needs. Exported for `impact`, which loads
// those plugins to compile the same config doctor's survival check probes — the
// alternative was a second copy of the gate-to-carrier table, and a table that
// exists twice is one that goes out of step. (It would sit lower still in
// `emit/lint`, beside the options it describes; that move is a refactor, and this
// export is the part the fix needs.)
export { expectedCarriers } from './wiring';
export type { GateStatus, LayerBans, RulesOptions } from './rules';
export type { Finding, Severity } from './types';
