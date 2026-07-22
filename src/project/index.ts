export {
  AUTHORING_FILE,
  COMMAND_FILE,
  CONFIG_FILE,
  detect,
  detectAliases,
  GENERATED_ESLINT_BANNER,
  parseJsonc,
  pathAliasKeys,
  quotedIn,
  readTexts,
} from './detect';
export { loadProjectModule, unwrapModule } from './load';
export { buildConfigSource, buildNextConfigSource, resolveBlueprint } from './resolve';
export type { ResolveOptions } from './resolve';
export type { PackageManager, ProjectState } from './types';
