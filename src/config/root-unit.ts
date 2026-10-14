import type { ResolvedModule } from './modules';
import type { ResolvedSourcePosition } from './resolved';
import type { Framework } from './types';

export const FRAMEWORK_EXTS: Record<Framework, string> = {
  vue: 'js,jsx,ts,tsx,vue',
  react: 'js,jsx,ts,tsx',
  auto: 'js,jsx,ts,tsx,vue',
};

export interface ResolvedRootUnitFiles {
  members: string[];
  entries: string[];
  entry: string | null;
}

export interface ResolvedRootUnit {
  module: ResolvedModule;
  root: string;
  entry: 'index';
  files(framework: Framework): string[];
  contains(file: string, framework: Framework): boolean;
  /** Resolve the entry from governed files after test and ignore exemptions. */
  resolve(governedFiles: string[], framework: Framework): ResolvedRootUnitFiles | null;
}

export interface ResolvedRootUnitImport {
  target: ResolvedRootUnit;
  sameUnit: boolean;
  bare: boolean;
}

export function resolveRootUnits(modules: ResolvedModule[]): ResolvedRootUnit[] {
  return modules.map((module) => {
    const prefix = `${module.root}/`;

    const contains = (file: string, framework: Framework): boolean => {
      if (!file.startsWith(prefix)) {
        return false;
      }

      const member = file.slice(prefix.length);

      return !member.includes('/') && supportedSource(member, framework);
    };

    return {
      module,
      root: module.root,
      entry: 'index',
      files: (framework) => [`${module.root}/*.{${FRAMEWORK_EXTS[framework]}}`],
      contains,
      resolve(governedFiles, framework) {
        const members = governedFiles.filter((file) => contains(file, framework));

        if (members.length === 0) {
          return null;
        }

        const entries = members.filter((file) => file.slice(prefix.length).replace(/\.[^.]+$/, '') === 'index');

        return { members, entries, entry: entries.length === 1 ? entries[0] : null };
      },
    };
  });
}

export function resolveRootUnitImport(
  scope: { units: ResolvedRootUnit[]; layers: string[]; importerSegments: string[] },
  importer: ResolvedSourcePosition | null,
  target: string[] | null,
): ResolvedRootUnitImport | null {
  if (!target || target.length < 1 || target.length > 2) {
    return null;
  }

  const unit = scope.units.find((candidate) => candidate.module.name === target[0]);

  if (!unit || (target.length === 2 && scope.layers.includes(target[1]))) {
    return null;
  }

  return {
    target: unit,
    bare: target.length === 1,
    sameUnit: scope.importerSegments.length === 2
      && importer?.kind === 'container' && importer.module.name === unit.module.name,
  };
}

function supportedSource(file: string, framework: Framework): boolean {
  return FRAMEWORK_EXTS[framework].split(',').some((extension) => file.endsWith(`.${extension}`));
}
