export {
  AUTHORING_FILE,
  claudeDirState,
  COMMAND_FILE,
  CONFIG_FILE,
  detect,
  detectAliases,
  GENERATED_ESLINT_BANNER,
  pathAliasKeys,
  quotedIn,
  readTexts,
  SUPPORTED_ESLINT_MAJORS,
} from './detect';
export type { ClaudeDirState } from './detect';
export { describeUnreadable, parseJsonc, unreadableTsconfigs } from './jsonc';
export type { JsoncFailure, JsoncResult, UnreadableConfig } from './jsonc';
export { loadProjectModule, unwrapModule } from './load';
export { buildConfigSource, buildNextConfigSource, resolveBlueprint } from './resolve';
export type { ResolveOptions } from './resolve';
export { tscArtifactsOutOfTree, viteTsCoverage } from './tsconfig';
export type { TscArtifactLocation, ViteTsCoverage } from './tsconfig';
export type { PackageManager, ProjectState } from './types';
