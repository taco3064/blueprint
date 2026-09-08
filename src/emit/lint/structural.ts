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
  const targetModules = module === undefined ? [undefined] : modules;

  const patterns: GroupPattern[] = [{
    group: ['./../**', '././**'],
    message: '\n🚫 Redundant relative segments (././, ./../) bypass the structural import rules.',
  }, ...aliases.flatMap((alias) => {
    const specifier = aliasSpecifier(alias, layer, module);

    if (specifier === null) {
      return [];
    }

    const head = `\n🚫 Same-layer imports inside this module must be relative. "${specifier}" `
      + `and everything under it is banned. Replace "${specifier}/X" with `;

    return [{
      group: [specifier, `${specifier}/**`],
      message: unitLayout === 'file'
        ? `${head}"./X".`
        : `${head}"../X" — its entry only; what is behind the entry stays private.`,
    }];
  })];

  if (forbidden.length) {
    patterns.push({
      group: forbidden.flatMap((banned) => targetModules.flatMap((targetModule) =>
        aliases.flatMap((alias) => {
          const specifier = aliasSpecifier(alias, banned, targetModule);

          return specifier === null ? [] : [specifier, `${specifier}/**`];
        }))),
      message: '\n🚫 This import violates the inner layer dependency flow. '
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
      group: folderTargets.flatMap((target) => targetModules.flatMap((targetModule) =>
        aliases.flatMap((alias) => {
          const specifier = aliasSpecifier(alias, target, targetModule);

          return specifier === null ? [] : `${specifier}/*/**`;
        }))),
      message: '\n🚫 Import a unit through its entry, not its internals '
        + '(for example "~app/auth/hooks/useX", not "~app/auth/hooks/useX/impl").',
    });
  }

  return patterns;
}
