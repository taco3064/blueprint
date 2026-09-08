import { aliasSpecifier } from '../../config';
import type { AliasRoot } from '../../config';
import type { GroupPattern } from './types';

export function buildStructuralPatterns(params: {
  layer: string;
  aliases: (AliasRoot | string)[];
  forbidden: string[];
  moduleLayout: 'folder' | 'flat';
  folderTargets?: string[];
  fixtures?: string[];
}): GroupPattern[] {
  const { layer, aliases, forbidden, moduleLayout, folderTargets, fixtures } = params;

  const patterns: GroupPattern[] = [{
    group: ['./../**', '././**'],
    message: '\n🚫 Redundant relative segments (././, ./../) bypass the structural import rules.',
  }, ...aliases.flatMap((alias) => {
    const specifier = aliasSpecifier(alias, layer);

    if (specifier === null) {
      return [];
    }

    const head = `\n🚫 Same-layer imports must be relative. "${specifier}" and everything under it `
      + `is banned. Replace "${specifier}/X" with `;

    return [{
      group: [specifier, `${specifier}/**`],
      message: moduleLayout === 'flat'
        ? `${head}"./X".`
        : `${head}"../X" — its entry only; what is behind the entry stays private.`,
    }];
  })];

  if (forbidden.length) {
    patterns.push({
      group: forbidden.flatMap((banned) => aliases.flatMap((alias) => {
        const specifier = aliasSpecifier(alias, banned);

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
        const specifier = aliasSpecifier(alias, target);

        return specifier === null ? [] : `${specifier}/*/**`;
      })),
      message: '\n🚫 Import a module through its entry, not its internals (e.g. "~app/hooks/useX", '
        + 'not "~app/hooks/useX/impl").',
    });
  }

  return patterns;
}
