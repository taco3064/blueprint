export {
  CONFIG_FILE,
  detect,
  detectAliases,
  GENERATED_ESLINT_BANNER,
  pathAliasKeys,
  readTexts,
} from './detect';
export { loadProjectModule, unwrapModule } from './load';
export { buildConfigSource, buildNextConfigSource, resolveBlueprint } from './resolve';
export type { ResolveOptions } from './resolve';
export type { PackageManager, ProjectState } from './types';
