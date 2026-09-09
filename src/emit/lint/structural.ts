import { aliasSpecifier } from '../../config';
import type { AliasRoot } from '../../config';
import type { GroupPattern } from './types';

export function buildStructuralPatterns(params: {
  layer: string;
  module?: string;
  modules?: string[];
  aliases: (AliasRoot | string)[];
  forbidden: string[];
  unitLayout: 'folder' | 'file';
  folderTargets?: string[];
  fixtures?: string[];
}): GroupPattern[] {
  const {
    layer,
    module,
    modules = [],
    aliases,
    forbidden,
    unitLayout,
    folderTargets,
    fixtures,
  } = params;

  const targetModules: (string | undefined)[] = module === undefined
    ? [undefined]
    : modules.length ? modules : [module];

  const sameLayer = specifiers(aliases, layer, [module]);

  const patterns: GroupPattern[] = [{
    group: ['./../**', '././**'],
    message: '\n🚫 Redundant relative segments (././, ./../) bypass the structural import rules.',
  }, ...sameLayer.map((specifier) => {
    const head = `\n🚫 Same-layer imports must be relative. "${specifier}" and everything under it `
      + `is banned. Replace "${specifier}/X" with `;

    return {
      group: [specifier, `${specifier}/**`],
      message: unitLayout === 'file'
        ? `${head}"./X".`
        : `${head}"../X" — its entry only; what is behind the entry stays private.`,
    };
  })];

  if (forbidden.length) {
    patterns.push({
      group: forbidden.flatMap((banned) =>
        specifiers(aliases, banned, targetModules).flatMap((specifier) => [
          specifier,
          `${specifier}/**`,
        ]),
      ),
      message: '\n🚫 This import violates the dependency flow. '
        + 'Only import from allowed lower layers.',
    });
  }

  if (fixtures?.length) {
    patterns.push({
      group: fixtures,
      message: '\n🚫 Production code must not import fixtures — '
        + 'missing data renders empty or error, '
        + 'never fake.',
    });
  }

  if (folderTargets?.length) {
    patterns.push({
      group: folderTargets.flatMap((target) =>
        specifiers(aliases, target, targetModules).map((specifier) => `${specifier}/*/**`),
      ),
      message: '\n🚫 Import a unit through its entry, not its internals.',
    });
  }

  return patterns;
}

function specifiers(
  aliases: (AliasRoot | string)[],
  layer: string,
  modules: (string | undefined)[],
): string[] {
  return modules.flatMap((module) =>
    aliases.flatMap((alias) => aliasSpecifier(alias, layer, module) ?? []),
  );
}
