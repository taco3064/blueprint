export {
  AUTHORING_FILE,
  claudeDirState,
  COMMAND_FILE,
  CONFIG_FILE,
  detect,
  ESLINT_FILES,
  GENERATED_ESLINT_BANNER,
  listSourceDirs,
  quotedIn,
  readTexts,
  VITE_FILES,
} from './detect';
export type { ClaudeDirState } from './detect';
export { REQUIRED_DEPS, STACK_DEPS, SUPPORTED_ESLINT_MAJORS } from './install';
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
export type { ResolvedBlueprint, ResolveOptions } from './resolve';
export type { PackageManager, ProjectState } from './types';
export { surveyScope, toolchainForProject, toolchainForSource } from './scope';
export type { ProjectToolchain, SurveyScope } from './scope';
export { relativeFilesystemPath, resolveProjectContext } from './context';
export type { PackageMetadata, ProjectContext } from './context';
export { assessLintEntrypoint } from './lint';
export type { LintEntrypointAssessment } from './lint';
export { canonicalPath, defaultGitReader, resolveRepositoryContext } from './repository';
export type { GitReader, GitReadResult, RepositoryContext } from './repository';
export { findConfigFiles, resolveRepositoryBlueprints } from './blueprints';
export type { RepositoryBlueprint, RepositoryBlueprintOptions } from './blueprints';
export {
  isTransformationObligation,
  readTransformationObligation,
  TRANSFORMATION_OBLIGATION_FILE,
  transformationObligationSource,
} from './transformation-obligation';
export type {
  LayerToModuleObligation,
  TransformationDecision,
  TransformationObligationFailure,
  TransformationSource,
} from './transformation-obligation';
export { aliasConsumerEvidence } from './alias-consumers';
export type {
  AliasConsumer,
  AliasConsumerEvidence,
  AliasConsumerStatus,
} from './alias-consumers';

export {
  assertTransformationAuthority, writeTransformationAuthority,
  recoverTransformationObligation, retainedTransformationOrigin,
  writeTransformationAuthorities,
} from './transformation-authority';
export type { AuthorityGit } from './transformation-authority';
