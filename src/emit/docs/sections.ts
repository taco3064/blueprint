import type {
  ArchitectureDef,
  AxisDef,
  Land,
  ModuleDef,
  PlaybookSection,
  PrincipleDef,
  RuleSetting,
} from '../../config';
import {
  readSetting,
  getFolderShape,
  getModules,
  getSharedFolder,
  normalizeAllowedImporters,
  normalizeModuleAllowedImporters,
} from '../../config';
import { enforcedBy, unavailableFromBlueprint } from '../lint';
import { escapeCell, formatOwns, table } from '../../markdown';
import { emitFlowDiagram } from './diagram';
import { featureRoot, moduleDiscipline, renderModules, renderModuleTree } from './modules';

/** Title + provenance banner. */
export function renderHeader(name: string | undefined): string {
  const title = name ? `${name} — Architecture Handbook` : 'Architecture Handbook';

  return [
    `# ${title}`,
    '',
    '> Generated from `blueprint.config` by `@kekkai/blueprint` — edit the blueprint, '
    + 'not this file.',
  ].join('\n');
}

/** One-way flow intro, the mermaid diagram, and the layers table. */
export function renderArchitecture(architecture: ArchitectureDef): string {
  const rows = architecture.layers.map((layer) => [
    `\`${layer.name}\``,
    escapeCell(layer.does),
    layer.mustNot?.length ? escapeCell(layer.mustNot.join('; ')) : '—',
    formatOwns(layer.owns) || '—',
  ]);

  return [
    '## Architecture',
    '',
    [
      'Code flows one way: each layer may import only from the layers below it.',
      'Upstream and same-layer imports are barred.',
      // The outer depth, stated where the reader first meets the flow — the
      // layers table below addresses folders that do not sit at the source
      // root under a modular blueprint. Placement, not existence: a config
      // whose every module declares `layers: false` has no layer folder at
      // all, and this sentence still says where one would go.
      ...(getModules(architecture).length
        ? ['The source root holds one folder per feature module, and a declared layer sits one '
          + 'level inside a module rather than at the source root.']
        : []),
    ].join(' '),
    '',
    emitFlowDiagram(architecture),
    '',
    '> **How to read the diagram**: a **solid** edge is a declared importer'
    + ' relation (its label carries the description and/or `selfOnly` — depend'
    + ' on it, never re-export it). A **dotted** edge only records declaration'
    + ' order: adjacent layers are not necessarily related. Reachability is'
    + ' transitive — a layer may import **any** layer below it in the flow,'
    + ' whether or not an edge is drawn, unless the target narrows its'
    + ' importers (`allowedImporters`).',
    // Outermost declaration first, the order `structureFindings` reports in:
    // a modular repo's source root holds modules, and the layers table that
    // follows describes what is nested inside one of them.
    ...renderModules(architecture),
    '',
    '### Layers',
    '',
    table(['Layer', 'Responsibility', 'Must not', 'Owns'], rows),
  ].join('\n');
}

/** Feature-folder shape, illustrated with a generated example tree. */
export function renderFolder(architecture: ArchitectureDef, exampleLayer: string): string {
  const folder = getSharedFolder(architecture);

  // The address, not just the name — the same move `renderPlacement` makes in the
  // agent contract: under a modular blueprint no layer folder sits at the source
  // root, so a bare `components/` here names the very path `undeclared-folder`
  // exists to move code out of. Generic `<Module>/`, not the example module the
  // tree above draws: the exception holds in every module that nests the layers.
  const at = getModules(architecture).length ? '<Module>/' : '';

  const exceptionLines = architecture.layers
    .filter((layer) => layer.folder !== undefined)
    .map((layer) => {
      const shape = getFolderShape(architecture, layer.name);

      return shape.layout === 'folder'
        ? `- \`${at}${layer.name}/\` — one folder per feature, entry \`${shape.entry}\`.`
        : `- \`${at}${layer.name}/\` — one file per feature (flat).`;
    });

  const exceptions = exceptionLines.length
    ? ['', 'Per-layer exceptions to the shared shape:', '', ...exceptionLines]
    : [];

  const moduleTree = renderModuleTree(architecture);

  if (folder.layout === 'flat') {
    return [
      '## Folder shape',
      '',
      ...moduleTree,
      'One feature = one file (flat layout). Shared logic moves down to a lower layer.',
      ...exceptions,
    ].join('\n');
  }

  const items: [string, string][] = [
    [folder.entry, 'public entry — the only importable file'],
    ['Example', 'implementation (named after the folder)'],
    ...folder.private.map((part): [string, string] => [part, 'private']),
  ];

  const tree = items.map(([part, note], i) => {
    const connector = i === items.length - 1 ? '└─' : '├─';

    return `   ${connector} ${part.padEnd(7)} # ${note}`;
  });

  return [
    '## Folder shape',
    '',
    ...moduleTree,
    `One feature = one folder. Only \`${folder.entry}\` is public; everything else stays private to the folder.`,
    '',
    '```',
    `${featureRoot(architecture, exampleLayer)}/`,
    '└─ Example/',
    ...tree,
    '```',
    ...exceptions,
  ].join('\n');
}

/** Prose for the boundaries the generated ESLint config enforces. */
export function renderImportDiscipline(architecture: ArchitectureDef): string {
  const { layers } = architecture;
  const folder = getSharedFolder(architecture);

  // Both axes, because `emitLint` emits the re-export ban from both: a module-level
  // `selfOnly` with no layer-level one used to leave the ban enforced and unstated.
  const selfOnlyLayers = layers.some((layer) =>
    normalizeAllowedImporters(layer.allowedImporters).some((importer) => importer.selfOnly),
  );

  const selfOnlyModules = getModules(architecture).some((module) =>
    normalizeModuleAllowedImporters(module.allowedImporters).some((importer) => importer.selfOnly),
  );

  const bullets = [
    '- **One-way only** — a layer imports only from the layers below it; '
    + 'upstream imports are errors.',
    folder.layout === 'flat'
      ? '- **No same-layer imports via the alias** — use a relative path instead.'
      : '- **No same-layer imports** — extract shared logic down to a lower layer instead.',
  ];

  const folderEntries = [
    ...new Set(
      layers
        .map((layer) => getFolderShape(architecture, layer.name))
        .filter((shape) => shape.layout === 'folder')
        .map((shape) => `\`${shape.entry}\``),
    ),
  ];

  if (folderEntries.length) {
    bullets.push(
      `- **Entry-only** — import a folder through its ${folderEntries.join(' / ')}, never its internals.`,
    );
  }

  const ownership = getModules(architecture).length
    ? '- **Ownership** — packages and globals are restricted to their owning layer or module '
    + '(see the *Owns* columns above). What a module owns reaches every layer nested inside '
    + 'it, and no layer outside it.'
    : '- **Ownership** — packages and globals are restricted to their owning layer '
      + '(see the *Owns* column above).';

  bullets.push(
    ...moduleDiscipline(architecture),
    '- **No redundant relative segments** (`./../`, `././`) that bypass the rules.',
    ownership,
  );

  if (selfOnlyLayers || selfOnlyModules) {
    // States the RULE and leaves the notation to the legend that owns it — described
    // twice, the two answers drifted and the wrong one pointed at the edges that are
    // explicitly NOT dependencies.
    const both = selfOnlyLayers && selfOnlyModules;
    const narrows = both ? 'a layer or module' : (selfOnlyModules ? 'a module' : 'a layer');

    bullets.push(
      `- **selfOnly** — where ${narrows} narrows its importers with \`selfOnly\`, that importer`
      + ' may depend on it but must never re-export it onward.',
    );
  }

  return [
    '## Import discipline',
    '',
    'These boundaries are enforced by the generated ESLint config — one blueprint drives both:',
    '',
    ...bullets,
  ].join('\n');
}

/** The component-shape axes — a set of design judgments, not a pipeline. */
export function renderComponentShape(axes: AxisDef[] | undefined): string {
  if (!axes?.length) {
    return '';
  }

  const blocks = axes.map((axis, i) => {
    const lines = [
      `### ${i + 1}. ${escapeCell(axis.name)} — ${escapeCell(axis.say)}`,
      '',
      escapeCell(axis.why),
    ];

    if (axis.triage) {
      lines.push(
        '',
        `> Triage: \`${axis.triage}\` is the review entry point — the verdict stays with review.`,
      );
    }

    return lines.join('\n');
  });

  return [
    `## Component shape — ${axes.length} orthogonal axes`,
    '',
    'A set, not a pipeline: each axis is an independent yes/no design decision — never infer',
    'that one axis holds because another does. Numbering is identity, not order, and trivial',
    'changes need not force the full pass. Lint is an entry point here, never a verdict.',
    '',
    blocks.join('\n\n'),
  ].join('\n');
}

/** Core beliefs, split by where they land: tooling vs. behavioral. */
export function renderPrinciples(principles: PrincipleDef[] | undefined): string {
  if (!principles?.length) {
    return '';
  }

  const list = (land: Land) =>
    principles
      .filter((principle) => principle.land === land)
      .map((principle) => `- **${escapeCell(principle.say)}** — ${escapeCell(principle.why)}`);

  const lint = list('lint');
  const claude = list('claude');
  const out = ['## Principles', ''];

  if (lint.length) {
    out.push('### Enforced by tooling', '', ...lint, '');
  }

  if (claude.length) {
    out.push('### Behavioral (held in review / CLAUDE.md)', '', ...claude);
  }

  return out.join('\n').trimEnd();
}

/** The working playbook — behavioral judgment rules, grouped by theme. */
export function renderPlaybook(playbook: PlaybookSection[] | undefined): string {
  if (!playbook?.length) {
    return '';
  }

  const sections = playbook.map((section) =>
    [
      `### ${escapeCell(section.title)}`,
      '',
      ...section.rules.map(
        (rule) =>
          `- **${escapeCell(rule.say)}**${rule.why ? ` — ${escapeCell(rule.why)}` : ''}`,
      ),
    ].join('\n'));

  return [
    '## Working playbook',
    '',
    'Judgment rules no tool enforces — they hold in review and in the agent contract.',
    '',
    sections.join('\n\n'),
  ].join('\n');
}

/** Enforcement rules and their landing tiers. */
export function renderRules(
  rules: Record<string, RuleSetting> | undefined,
  // Enough of the blueprint to answer "can this gate emit here at all", and what
  // surface the ones that do emit reach. This document outlives the adoption and the
  // contract links to it, so a row claiming `lint` holds a rule the emitted config
  // does not contain is the longest-lived version of that half-truth (field run #150)
  // — and so is a reach sentence naming a folder depth this blueprint does not have.
  facts: { framework?: string; testFiles?: string | string[]; modules?: ModuleDef[] } = {},
): string {
  const entries = Object.entries(rules ?? {});

  if (!entries.length) {
    return '';
  }

  // "error fails lint" is false for `cycles` (inspect's finding) and `deadCode`
  // (documentation), so each row says which machine holds it (field issue #52).
  const HELD_BY = {
    lint: 'lint',
    inspect: '`blueprint inspect`',
    docs: 'documentation only',
  } as const;

  const rows = entries.map(([id, setting]) => {
    const { tier, value } = readSetting(setting);
    // The declaration stays on the table — it is the author's, and dropping the row
    // would hide it. What cannot stay is the machine: nothing holds a gate this
    // blueprint cannot emit.
    const unavailable = unavailableFromBlueprint(id, facts.framework, facts.testFiles);

    return [
      `\`${id}\``,
      `\`${tier}\``,
      value === undefined ? '—' : `\`${value}\``,
      unavailable === null ? HELD_BY[enforcedBy(id)] : `nothing — ${unavailable}`,
    ];
  });

  // Modular, the globs are cut per module — a `layers: false` module has no layer
  // at all and its whole subtree is one governed group — so "a layer glob" names
  // nothing an all-opt-out repo has, and its reader reads "nothing is armed".
  const reach = facts.modules?.length
    ? 'the files a module glob matches: a declared module or layer holding no code'
    : 'the files a layer glob matches: a declared layer holding no code';

  return [
    '## Rules',
    '',
    table(['Rule', 'Tier', 'Option', 'Enforced by'], rows),
    '',
    // Reach, not only tier and machine: this document is read long after the CLI
    // output that marks an empty net as vacuous. Glob-relative rather than a count,
    // because it is generated from the blueprint and cannot see the repo.
    'The tier is what the enforcing machine does with a violation: `error` fails, '
    + '`warn` is advisory, `off` is disabled. Which machine differs — `lint` rows fail '
    + 'the project\'s lint run, `blueprint inspect` rows fail `blueprint inspect` and '
    + 'never appear in a lint run, documentation-only rows are recorded intent with '
    + 'no gate behind them at any tier, and a row reading `nothing` is lint-gated in '
    + 'general but cannot emit on THIS blueprint — the cell says which fact rules it '
    + `out. Every row reaches only ${reach} has nothing that can fail, which is runway `
    + 'rather than protection — `blueprint doctor` reports which of the two this repo '
    + 'has today.',
  ].join('\n');
}

/** Naming conventions, keyed by concept. */
export function renderNaming(naming: Record<string, string> | undefined): string {
  const entries = Object.entries(naming ?? {});

  if (!entries.length) {
    return '';
  }

  const rows = entries.map(([concept, convention]) => [
    `\`${concept}\``,
    escapeCell(convention),
  ]);

  return ['## Naming', '', table(['Concept', 'Convention'], rows)].join('\n');
}
