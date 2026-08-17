import type { ArchitectureDef, ModuleDef } from '../../config';
import {
  getForbiddenModules,
  getModuleEntry,
  getModuleImporters,
  getModules,
  splitModulesByLayers,
} from '../../config';
import { escapeCell, formatOwns, table } from '../../markdown';

/**
 * The handbook's module-axis passages — the table, the example tree, and the
 * import-discipline bullets. Its own satellite rather than three more branches
 * inside `sections.ts`, which is already at this repo's `maxLines` gate.
 *
 * Every one of them returns `[]` under the flat structure, which is what keeps
 * a handbook with no `architecture.modules` byte-identical to the one this tool
 * emitted before modules existed.
 */

/**
 * The module the example tree is drawn from: the first that keeps the shared
 * layers, else the first declared. Same choice `undeclared-folder` makes when it
 * names a destination for a layer folder sitting at the source root — a module
 * that opted out of layers is not somewhere a layer folder may go.
 */
function exampleModule(modules: ModuleDef[]): ModuleDef {
  return modules.find((module) => module.layers !== false) ?? modules[0];
}

/**
 * Where a feature folder actually sits, for the tree `renderFolder` draws one
 * depth further in. Under the flat structure that is the bare layer name and
 * nothing moves; inside a module the layer is one segment deeper, and a module
 * that declares `layers: false` holds its features directly.
 */
export function featureRoot(architecture: ArchitectureDef, layer: string): string {
  const modules = getModules(architecture);

  if (!modules.length) {
    return layer;
  }

  const example = exampleModule(modules);

  return example.layers === false ? example.name : `${example.name}/${layer}`;
}

/** One tree line, its `# note` aligned across the block. */
function treeLines(items: [string, string][]): string[] {
  const width = Math.max(...items.map(([part]) => part.length));

  return items.map(([part, note], i) =>
    `${i === items.length - 1 ? '└─' : '├─'} ${part.padEnd(width)} # ${note}`);
}

/**
 * The module folder, drawn. Placed above the feature-folder tree because it is
 * the folder an adopter meets first — the source root holds these, not layers.
 */
export function renderModuleTree(architecture: ArchitectureDef): string[] {
  const modules = getModules(architecture);

  if (!modules.length) {
    return [];
  }

  const example = exampleModule(modules);
  const entry = getModuleEntry(architecture, example.name);
  const alias = `${architecture.alias}/${example.name}`;

  const items: [string, string][] = [
    [entry, `the module's entry — what \`${alias}\` resolves to`],
    ...(example.layers === false
      ? [['…', 'its own files — this module declares `layers: false`'] as [string, string]]
      : architecture.layers.map((layer): [string, string] =>
          [`${layer.name}/`, 'a declared layer, nested inside the module'])),
  ];

  return [
    'One feature module = one folder at the source root. Another module imports it at '
    + `\`${architecture.alias}/<Module>\` — that path IS its entry file — and reaches nothing `
    + 'behind it.',
    '',
    '```',
    `${example.name}/`,
    ...treeLines(items),
    '```',
    '',
  ];
}

/**
 * The module table, in the Architecture section. Columns mirror the layers
 * table's, with `Holds` added for the one fact a layer has no equivalent of:
 * whether the shared layers are nested inside this module or it holds its files
 * directly.
 */
export function renderModules(architecture: ArchitectureDef): string[] {
  const modules = getModules(architecture);

  if (!modules.length) {
    return [];
  }

  const rows = modules.map((module) => [
    `\`${module.name}\``,
    escapeCell(module.does),
    module.layers === false ? 'its own files (`layers: false`)' : 'the layers below',
    // Resolved, never the raw override: a module inherits `architecture.folder.entry`
    // when it declares none, and the file another module's import resolves to is the
    // fact — not whether this module happened to restate it.
    `\`${getModuleEntry(architecture, module.name)}\``,
    // Resolved the same way, and for the same reason the Entry column is: the
    // default importer set is "every module declared before it", which no field
    // on the module states. Without it the `selfOnly` bullet below names a
    // narrowing this document prints nowhere — the layer half of that bullet is
    // grounded by a diagram edge, and the module half had nothing.
    getModuleImporters(architecture, module.name)
      .map((importer) => `\`${importer.module}\`${importer.selfOnly ? ' (selfOnly)' : ''}`)
      .join(', ') || '—',
    getForbiddenModules(architecture, module.name).map((name) => `\`${name}\``).join(', ') || '—',
    formatOwns(module.owns) || '—',
  ]);

  return [
    '',
    '### Modules',
    '',
    'Module order is the module flow: a module may import only modules declared after it, '
    + 'narrowed further by any `allowedImporters`.',
    '',
    table(
      ['Module', 'Responsibility', 'Holds', 'Entry', 'Importable by', 'Must not import', 'Owns'],
      rows,
    ),
  ];
}

/**
 * The module-axis bullets of the Import discipline list — the boundaries a
 * layer has no counterpart for, in the words the emitted ban messages use.
 *
 * The same-module bullet is computed rather than asserted: `alias/<Module>/
 * <layer>` survives `buildModuleSelfBan` only where a layer is nested to negate
 * back out of the ban, so a `layers: false` module gets the blanket over its
 * whole subtree and naming the route there sends the reader into an error. Both
 * halves speak for that ban only — the entry bullet above is a different ban
 * (`buildModulePatterns`), and `alias/<Other>` stays legal inside a `layers:
 * false` module, so a sentence over every alias spelling would deny the one
 * route an all-opt-out repo has.
 * The root-file bullet is the dead end that follows — a module's root files
 * are in no layer, so a file inside one reaches them by neither route, and
 * the two emitted messages each point at the route the other bans.
 */
export function moduleDiscipline(architecture: ArchitectureDef): string[] {
  if (!getModules(architecture).length) {
    return [];
  }

  const { alias } = architecture;
  const { layered, unlayered } = splitModulesByLayers(architecture);

  const optOut = unlayered.length
    ? ` Not inside ${unlayered.map((name) => `\`${name}\``).join(', ')} `
    + '(`layers: false`) — there it covers the whole subtree, cross-layer route included.'
    : '';

  const route = layered.length
    ? `The same-module ban leaves one path open: \`${alias}/<Module>/<layer>\`, the cross-layer `
    + `route one depth in.${optOut}`
    : 'Every module here declares `layers: false`, so the same-module ban covers each module\'s '
      + 'whole subtree — there is no cross-layer route open anywhere here.';

  return [
    `- **Module entry only** — reach another module at \`${alias}/<Module>\`; that path IS its `
    + 'entry, and what sits behind it is that module\'s own business.',
    `- **Same-module imports are relative** — \`./X\`, never \`${alias}/<Module>/X\`: the alias `
    + `is how a module is reached from outside it. ${route}`,
    ...(layered.length
      ? [
          '- **A module\'s root files are its own wiring** — they sit outside every layer, so '
          + `nothing inside a layer reaches them: \`../<file>\` leaves the layer, and `
          + `\`${alias}/<Module>/<file>\` is a same-module alias import. Both are errors, so `
          + 'what a layer needs lives in a layer.',
        ]
      : []),
  ];
}
