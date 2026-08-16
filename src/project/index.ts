export {
  AUTHORING_FILE,
  claudeDirState,
  COMMAND_FILE,
  CONFIG_FILE,
  detect,
  GENERATED_ESLINT_BANNER,
  quotedIn,
  readTexts,
} from './detect';
export type { ClaudeDirState } from './detect';
export { SUPPORTED_ESLINT_MAJORS } from './install';
export { describeUnreadable, parseJsonc, unreadableTsconfigs } from './jsonc';
export type { JsoncFailure, JsoncResult, UnreadableConfig } from './jsonc';
export {
  detectAliases,
  pathAliasKeys,
  tscArtifactsOutOfTree,
  viteTsCoverage,
} from './tsconfig';
export type { TscArtifactLocation, ViteTsCoverage } from './tsconfig';
export { loadProjectModule, unwrapModule } from './load';
export { buildConfigSource, buildNextConfigSource, resolveBlueprint } from './resolve';
export type { ResolveOptions } from './resolve';
export type { PackageManager, ProjectState } from './types';
