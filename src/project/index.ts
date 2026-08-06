export {
  AUTHORING_FILE,
  COMMAND_FILE,
  CONFIG_FILE,
  describeUnreadable,
  detect,
  detectAliases,
  GENERATED_ESLINT_BANNER,
  parseJsonc,
  pathAliasKeys,
  quotedIn,
  readTexts,
  SUPPORTED_ESLINT_MAJORS,
  tscArtifactsOutOfTree,
  unreadableTsconfigs,
  viteTsCoverage,
} from './detect';
export type {
  JsoncFailure,
  JsoncResult,
  TscArtifactLocation,
  UnreadableConfig,
  ViteTsCoverage,
} from './detect';
export { loadProjectModule, unwrapModule } from './load';
export { buildConfigSource, buildNextConfigSource, resolveBlueprint } from './resolve';
export type { ResolveOptions } from './resolve';
export type { PackageManager, ProjectState } from './types';
