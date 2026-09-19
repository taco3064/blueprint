export { adoptionProvenance } from './adoption';
export type { AdoptionProvenance, AppliedAction } from './adoption';
export { applicableScope } from './applicability';
export type { ApplicableScope } from './applicability';
export { LEGACY_CONFIG_KEYS, LIFECYCLE_SINCE, UPGRADE_CATALOG } from './catalog';
export { sourceCheckpoint } from './checkpoint';
export type { SourceCheckpoint, SourceCheckpointInput } from './checkpoint';
export { occurrences, textHunks } from './hunks';
export type { TextHunk } from './hunks';
export {
  ancestors,
  installedPackage,
  manifestOwner,
  PACKAGE_NAME,
  runningInstallSpec,
  runningPackage,
} from './package';
export type { ManifestOwner, PackageLocation } from './package';
export { lifecycleHistoryProblem } from './history';
export { planIdentity, withPlanIdentity } from './plan';
export type { PlannedUpgrade } from './plan';
export { digest, forgetPaths, mergeProvenance, parseProvenance } from './provenance';
export {
  applicationKey,
  lifecycleStateProblem,
  lostLifecycleState,
  recordAdoption,
  UPGRADE_PLAYBOOK_FILE,
} from './record';
export type {
  LifecycleEstablishment,
  RecordAdoptionInput,
  RecordAdoptionOutcome,
} from './record';
export { resolveUpgrade } from './resolve';
export { lifecycleRootFor } from './root';
export type {
  ResolutionProblem,
  ResolveUpgradeInput,
  SuppressedOperation,
  UpgradePlan,
  UpgradeResolution,
} from './resolve';
export {
  LIFECYCLE_DRAFT,
  LIFECYCLE_FILE,
  parseLifecycleState,
  readLifecycleState,
  serializeLifecycleState,
  writeLifecycleState,
  writeLifecycleText,
} from './state';
export type { LifecycleStateRead } from './state';
export { lifecycleStateHistory } from './state-history';
export type { LifecycleStateHistory } from './state-history';
export type * from './types';
export { catalogProblems } from './validate';
export type { CatalogProblem, CatalogRelation } from './validate';
export { compareVersions, isVersion } from './version';
