export {
  AUTHORING_FILE,
  claudeDirState,
  COMMAND_FILE,
  CONFIG_FILE,
  detect,
  GENERATED_ESLINT_BANNER,
  listSourceDirs,
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
export { loadProjectModule, unwrapModule, versionedModuleUrl } from './load';
export { buildConfigSource, buildNextConfigSource, resolveBlueprint } from './resolve';
export type { ResolveOptions } from './resolve';
export type { PackageManager, ProjectState } from './types';
export { surveyScope, toolchainForProject, toolchainForSource } from './scope';
export type { ProjectToolchain, SurveyScope } from './scope';
export { resolveProjectContext } from './context';
export type { PackageMetadata, ProjectContext } from './context';
export { assessLintEntrypoint } from './lint';
export type { LintEntrypointAssessment } from './lint';
export { defaultGitReader, resolveRepositoryContext } from './repository';
export type { GitReader, GitReadResult, RepositoryContext } from './repository';
export { resolveRepositoryBlueprints } from './blueprints';
export type { RepositoryBlueprint, RepositoryBlueprintOptions } from './blueprints';
