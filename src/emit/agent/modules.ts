import type { ArchitectureDef } from '../../config';
import {
  getModuleEntry,
  getModules,
  normalizeModuleAllowedImporters,
  sourcePrefix,
  splitModulesByLayers,
} from '../../config';
import { formatOwns } from '../../markdown';

/**
 * The agent contract's module-axis directives. Its own satellite rather than
 * more branches inside `sections.ts`, which is already at this repo's
 * `maxLines` gate — and every function here answers nothing under the flat
 * structure, which is what keeps a contract with no `architecture.modules`
 * byte-identical to the one this tool emitted before modules existed.
 */

/** `` `Shell` → `Combat` ``, or null under the flat structure. */
export function moduleChain(architecture: ArchitectureDef): string | null {
  const modules = getModules(architecture);

  return modules.length ? modules.map((module) => `\`${module.name}\``).join(' → ') : null;
}

/**
 * How the compact contract names the surface its hard gates reach, or null
 * under the flat structure — where the layer globs ARE that surface and the
 * sentence has not moved a character.
 *
 * Modular, the emitted entries are cut per module: a `layers: false` module
 * has no layer at all and its whole subtree is one governed group, so "the
 * layer globs" names nothing an all-opt-out repo has, and the reader of a
 * repo with two live groups is told nothing is armed.
 */
export function moduleGateReach(architecture: ArchitectureDef): string | null {
  return getModules(architecture).length
    ? 'the files each module\'s globs match — a module or layer holding no code'
    : null;
}

/** A module-name list, code-spelled: `` `common`, `shared` ``. */
function names(list: string[]): string {
  return list.map((name) => `\`${name}\``).join(', ');
}

/**
 * What the same-module ban leaves open, computed — the answer differs per
 * config, and every sentence here is about that ban alone. Reaching ANOTHER
 * module at `alias/<Other>` is a different ban's business
 * (`buildModulePatterns`, the bullet above), legal from inside a `layers:
 * false` module like anywhere else, so nothing here may speak for every alias
 * spelling.
 *
 * `alias/<Module>/<layer>` is open only where a layer is nested to name:
 * `buildModuleSelfBan` negates the declared layer names back out of the ban,
 * and a module holding its own files has none to negate, so it gets the
 * blanket `alias/<Module>/**` over its whole subtree.
 */
function crossLayerRoute(architecture: ArchitectureDef): string {
  const { alias } = architecture;
  const { layered, unlayered } = splitModulesByLayers(architecture);

  if (!layered.length) {
    return 'Every module here declares `layers: false`, so the same-module ban covers each '
      + 'module\'s whole subtree — there is no cross-layer route open anywhere here.';
  }

  const optOut = unlayered.length
    ? ` Not inside ${names(unlayered)} (\`layers: false\`) — there it covers the whole subtree, `
    + 'cross-layer route included.'
    : '';

  return `The same-module ban leaves one path open: \`${alias}/<Module>/<layer>\`, the `
    + `cross-layer route one depth in.${optOut}`;
}

/**
 * The dead end an agent walks into otherwise: a module's root files sit in no
 * layer, so a file inside one reaches them by neither route. Both halves are
 * emitted errors already, and each of their messages points at the other —
 * `relative-escape` says "use the alias", the same-module ban says "make it
 * relative" — so the contract has to say the target is out of reach, not name
 * a route. Silent where no module nests a layer: nothing there is inside one.
 */
function rootFileRule(architecture: ArchitectureDef): string[] {
  const { alias } = architecture;

  return splitModulesByLayers(architecture).layered.length
    ? [
        'A module\'s own root files sit outside every layer: from inside a layer '
        + `\`../<file>\` leaves the layer and \`${alias}/<Module>/<file>\` is a same-module `
        + 'alias import, so both are errors. What a layer needs lives in a layer, never '
        + 'beside the module entry.',
      ]
    : [];
}

/**
 * The compact contract's module bullet: the flow, where the folders are, and
 * the two spellings a reader gets wrong — reaching past another module's entry,
 * and reaching its own module through the alias. Denser than the full
 * contract's, because the compact block is one screen and the handbook link
 * beside it carries the table.
 */
export function compactModuleBullet(architecture: ArchitectureDef): string[] {
  const chain = moduleChain(architecture);

  if (chain === null) {
    return [];
  }

  const { alias } = architecture;
  const tail = [crossLayerRoute(architecture), ...rootFileRule(architecture)].join(' ');

  return [
    `- Module flow: ${chain} — one folder per module at the source root; a declared layer sits `
    + `one level inside a module, never at the source root. Import another module at `
    + `\`${alias}/<Module>\` and no deeper: that path IS its entry. Inside your own module `
    + `imports are relative (\`./X\`), never \`${alias}/<Module>/X\`. ${tail}`,
  ];
}

/**
 * "### Where code goes" one depth up — the orientation line and one directive
 * per module, in the shape the layer directives beside them take.
 */
export function modulePlacement(architecture: ArchitectureDef): string[] {
  const modules = getModules(architecture);

  if (!modules.length) {
    return [];
  }

  // Same normalization the layer directives beside these are built from — a
  // module folder's address is the source root plus its name, and hardcoding
  // `src/` names a folder a `sourceRoot: '.'` or `'lib/app'` repo does not have.
  const root = sourcePrefix(architecture.sourceRoot);

  return [
    '- The source root holds one folder per module; a declared layer sits one level inside a '
    + 'module, never at the source root.',
    ...modules.map((module) => {
      // The entry is on every line, not only where a module overrides it: this is
      // the file another module's `~app/<Module>` import resolves to, so an agent
      // creating the module has to write it, and inferring it from the shared
      // folder shape two bullets down is a step it can get wrong silently.
      const parts = [
        `- \`${root}${module.name}/\` — ${module.does}.`,
        ` ENTRY: \`${getModuleEntry(architecture, module.name)}\`.`,
      ];

      if (module.layers === false) {
        parts.push(' HOLDS: its own files — no declared layer sits inside it.');
      }

      const owns = formatOwns(module.owns);

      if (owns) {
        parts.push(` OWNS: ${owns}.`);
      }

      if (module.allowedImporters) {
        const importers = normalizeModuleAllowedImporters(module.allowedImporters)
          .map((importer) => (importer.selfOnly ? `${importer.module} (selfOnly)` : importer.module))
          .join(', ');

        parts.push(` IMPORTABLE BY: ${importers}.`);
      }

      return parts.join('');
    }),
  ];
}

/** The module axis's share of "### Hard rules" — the bans lint actually emits. */
export function moduleHardRules(architecture: ArchitectureDef): string[] {
  if (!getModules(architecture).length) {
    return [];
  }

  const { alias } = architecture;

  return [
    `- Import another module at \`${alias}/<Module>\` only — that path IS its entry, and what `
    + 'sits behind it is that module\'s own business.',
    `- Inside a module, import its own files relatively (\`./X\`), never through \`${alias}\`. `
    + crossLayerRoute(architecture),
    ...rootFileRule(architecture).map((rule) => `- ${rule}`),
    '- A module may import only modules declared after it, and only where that module\'s '
    + '`allowedImporters` does not narrow it out.',
  ];
}
