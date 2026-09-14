import { resolveArchitecture } from '../config';
import type { Blueprint } from '../config';
import { FRAMEWORK_EXTS } from '../emit/lint';
import { GENERATED_ESLINT_BANNER } from '../project';
import type { ProjectState } from '../project';
import {
  eslintConfigSource as renderEslintConfigSource,
} from '../operational-contract';

export function eslintConfigSource(blueprint: Blueprint, state: ProjectState): string {
  const framework = blueprint.framework !== 'auto' ? blueprint.framework : state.framework;
  const sourceRoot = resolveArchitecture(blueprint.architecture).sourceRoot;

  return renderEslintConfigSource({
    framework,
    generatedBanner: GENERATED_ESLINT_BANNER,
    guardExtensions: framework ? FRAMEWORK_EXTS[framework] : FRAMEWORK_EXTS.auto,
    hasTypescript: state.hasTypescript,
    sourceRoot,
    basePath: state.eslintBasePath,
  });
}
