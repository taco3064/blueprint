export { defineBlueprint, normalizeAgentEmit, validateBlueprint } from './defineBlueprint';
export {
  isLegacyBlueprintMigration,
  migrateLegacyBlueprint,
  migratedConfigSource,
} from './legacy';
export {
  aliasRoot,
  aliasSpecifier,
  aliasLayerRoots,
  getDiagramEdges,
  getForbiddenLayers,
  getUnitShape,
  getSelfOnlyTargets,
  normalizeAllowedImporters,
} from './graph';
export type { AliasRoot, DiagramEdge } from './graph';
export { activeSetting, readSetting } from './settings';
export type { ReadSetting } from './settings';
export { resolveTestFiles } from './test-files';
export type { ResolvedTestFiles } from './test-files';
export { resolveArchitecture, resolveLayerFilePatterns } from './resolved';
export type { ResolvedImportReference } from './import-reference';
export type {
  ResolveArchitectureContext,
  ResolvedArchitecture,
  ResolvedDependencyEndpoint,
  ResolvedDependencyVerdict,
  ResolvedLayer,
  ResolvedLayerPosition,
  ResolvedModule,
  ResolvedSourcePosition,
} from './resolved';
export { sourcePath, sourceRoot, sourceRootLabel, stripSourceRoot } from './source';
export type * from './types';
