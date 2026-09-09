import { aliasSpecifier } from '../../config';
import type { AliasRoot } from '../../config';
import type { GroupPattern } from './types';

export function buildStructuralPatterns(params: {
  layer: string;
  module?: string;
  aliases: (AliasRoot | string)[];
  forbidden: string[];
  unitLayout: 'folder' | 'file';
  folderTargets?: string[];
  fixtures?: string[];
}): GroupPattern[] {
  const { layer, module, aliases, forbidden, unitLayout, folderTargets, fixtures } = params;
  const inModule = (target: string) => module ? `${module}/${target}` : target;

  const patterns: GroupPattern[] = [{
    group: ['./../**', '././**'],
    message: '\n🚫 Redundant relative segments (././, ./../) bypass the structural import rules.',
  }, ...aliases.flatMap((alias) => {
    const specifier = aliasSpecifier(alias, inModule(layer));

    if (specifier === null) {
      return [];
    }

    const head = `\n🚫 Same-layer imports must be relative. "${specifier}" and everything under it `
      + `is banned. Replace "${specifier}/X" with `;

    return [{
      group: [specifier, `${specifier}/**`],
      message: unitLayout === 'file'
        ? `${head}"./X".`
        : `${head}"../X" — its entry only; what is behind the entry stays private.`,
    }];
  })];

  if (forbidden.length) {
    patterns.push({
      group: forbidden.flatMap((banned) => aliases.flatMap((alias) => {
        const specifier = aliasSpecifier(alias, inModule(banned));

        return specifier === null ? [] : [specifier, `${specifier}/**`];
      })),
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
      group: folderTargets.flatMap((target) => aliases.flatMap((alias) => {
        const specifier = aliasSpecifier(alias, inModule(target));

        return specifier === null ? [] : `${specifier}/*/**`;
      })),
      message: '\n🚫 Import a unit through its entry, not its internals (e.g. "~app/hooks/useX", '
        + 'not "~app/hooks/useX/impl").',
    });
  }

  return patterns;
}

export function buildContainerPatterns(params: {
  module: string;
  aliases: (AliasRoot | string)[];
  folderTargets: string[];
  fixtures?: string[];
}): GroupPattern[] {
  const { module, aliases, folderTargets, fixtures } = params;

  const patterns: GroupPattern[] = [{
    group: ['./../**', '././**'],
    message: '\n🚫 Redundant relative segments (././, ./../) bypass the structural import rules.',
  }];

  if (fixtures?.length) {
    patterns.push({
      group: fixtures,
      message: '\n🚫 Production code must not import fixtures — missing data renders empty or '
        + 'error, never fake.',
    });
  }

  if (folderTargets.length) {
    patterns.push({
      group: folderTargets.flatMap((target) => aliases.flatMap((alias) => {
        const specifier = aliasSpecifier(alias, `${module}/${target}`);

        return specifier === null ? [] : `${specifier}/*/**`;
      })),
      message: '\n🚫 Import a unit through its entry, not its internals.',
    });
  }

  return patterns;
}
