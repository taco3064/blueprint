export { defineBlueprint, normalizeAgentEmit, validateBlueprint } from './defineBlueprint';
export {
  aliasRoot,
  aliasSpecifier,
  aliasLayerRoots,
  getDiagramEdges,
  getForbiddenLayers,
  getModuleShape,
  getSelfOnlyTargets,
  getSharedModule,
  normalizeAllowedImporters,
} from './graph';
export type { AliasRoot, DiagramEdge } from './graph';
export { activeSetting, readSetting } from './settings';
export type { ReadSetting } from './settings';
export { resolveArchitecture, resolveLayerFilePatterns } from './resolved';
export { sourcePath, sourceRoot, sourceRootLabel, stripSourceRoot } from './source';
export type * from './types';
