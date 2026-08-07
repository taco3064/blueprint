import type {
  ArchitectureDef,
  AxisDef,
  Land,
  PlaybookSection,
  PrincipleDef,
  RuleSetting,
} from '../../config';
import { readSetting, getModuleShape, getSharedModule, normalizeAllowedImporters } from '../../config';
import { enforcedBy, unavailableFromBlueprint } from '../lint';
import { escapeCell, formatOwns, table } from '../../markdown';
import { emitFlowDiagram } from './diagram';

/** Title + provenance banner. */
export function renderHeader(name: string | undefined): string {
  const title = name ? `${name} — Architecture Handbook` : 'Architecture Handbook';

  return [
    `# ${title}`,
    '',
    '> Generated from `blueprint.config` by `@kekkai/blueprint` — edit the blueprint, not this file.',
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
    'Code flows one way: each layer may import only from the layers below it. Upstream and same-layer imports are barred.',
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
    '',
    '### Layers',
    '',
    table(['Layer', 'Responsibility', 'Must not', 'Owns'], rows),
  ].join('\n');
}

/** Feature-folder shape, illustrated with a generated example tree. */
export function renderModule(architecture: ArchitectureDef, exampleLayer: string): string {
  const module = getSharedModule(architecture);

  const exceptionLines = architecture.layers
    .filter((layer) => layer.module !== undefined)
    .map((layer) => {
      const shape = getModuleShape(architecture, layer.name);

      return shape.layout === 'folder'
        ? `- \`${layer.name}/\` — one folder per module, entry \`${shape.entry}\`.`
        : `- \`${layer.name}/\` — one file per module (flat).`;
    });

  const exceptions = exceptionLines.length
    ? ['', 'Per-layer exceptions to the shared shape:', '', ...exceptionLines]
    : [];

  if (module.layout === 'flat') {
    return [
      '## Module shape',
      '',
      'One module = one file (flat layout). Shared logic moves down to a lower layer.',
      ...exceptions,
    ].join('\n');
  }

  const items: [string, string][] = [
    [module.entry, 'public entry — the only importable file'],
    ['Example', 'implementation (named after the module)'],
    ...module.private.map((part): [string, string] => [part, 'private']),
  ];

  const tree = items.map(([part, note], i) => {
    const connector = i === items.length - 1 ? '└─' : '├─';

    return `   ${connector} ${part.padEnd(7)} # ${note}`;
  });

  return [
    '## Module shape',
    '',
    `One module = one folder. Only \`${module.entry}\` is public; everything else stays private to the module.`,
    '',
    '```',
    `${exampleLayer}/`,
    '└─ Example/',
    ...tree,
    '```',
    ...exceptions,
  ].join('\n');
}

/** Prose for the boundaries the generated ESLint config enforces. */
export function renderImportDiscipline(architecture: ArchitectureDef): string {
  const { layers } = architecture;
  const module = getSharedModule(architecture);

  const hasSelfOnly = layers.some((layer) =>
    normalizeAllowedImporters(layer.allowedImporters).some((importer) => importer.selfOnly),
  );

  const bullets = [
    '- **One-way only** — a layer imports only from the layers below it; upstream imports are errors.',
    module.layout === 'flat'
      ? '- **No same-layer imports via the alias** — use a relative path instead.'
      : '- **No same-layer imports** — extract shared logic down to a lower layer instead.',
  ];

  const folderEntries = [
    ...new Set(
      layers
        .map((layer) => getModuleShape(architecture, layer.name))
        .filter((shape) => shape.layout === 'folder')
        .map((shape) => `\`${shape.entry}\``),
    ),
  ];

  if (folderEntries.length) {
    bullets.push(
      `- **Entry-only** — import a module through its ${folderEntries.join(' / ')}, never its internals.`,
    );
  }

  bullets.push(
    '- **No redundant relative segments** (`./../`, `././`) that bypass the rules.',
    '- **Ownership** — packages and globals are restricted to their owning layer (see the *Owns* column above).',
  );

  if (hasSelfOnly) {
    // States the RULE, and leaves the notation to the legend that owns it. This said
    // "a dashed edge may be depended on…" while the legend twelve lines above says a
    // solid edge carries `selfOnly` and a dotted one records declaration order only —
    // one document, two answers, and the wrong one points the reader at the edges that
    // are explicitly NOT dependencies. Describing the drawing twice is what let them
    // drift; the legend describes it once.
    bullets.push(
      '- **selfOnly** — where a layer narrows its importers with `selfOnly`, that importer'
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
  if (!axes?.length) return '';

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
  if (!principles?.length) return '';

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
  if (!playbook?.length) return '';

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
  // Enough of the blueprint to answer "can this gate emit here at all". This document
  // outlives the adoption and the contract links to it, so a row claiming `lint` holds a
  // rule the emitted config does not contain is the longest-lived version of that
  // half-truth (field run #150).
  facts: { framework?: string; testFiles?: string | string[] } = {},
): string {
  const entries = Object.entries(rules ?? {});

  if (!entries.length) return '';

  // "error fails lint" is true of most rows and false of two kinds: `cycles`
  // is inspect's finding, and `deadCode` is documentation. Printing the tier
  // under an unqualified legend told a reader of THIS file — the artifact
  // meant to outlive the adoption — that a doc-only id gates their build
  // (field issue #52). Each row now says which machine holds it.
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

  return [
    '## Rules',
    '',
    table(['Rule', 'Tier', 'Option', 'Enforced by'], rows),
    '',
    // Reach, not only tier and machine. This document outlives the adoption and the
    // agent contract links to it, so it is read long after the CLI output that marks a
    // net over an empty repo as vacuous. Two field agents raised exactly this about the
    // contract; the same gap sat one artifact further along. Stated glob-relative rather
    // than as a count, because this file is generated from the blueprint alone — it
    // cannot see the repo, and a number would be wrong the day code lands.
    'The tier is what the enforcing machine does with a violation: `error` fails, '
    + '`warn` is advisory, `off` is disabled. Which machine differs — `lint` rows fail '
    + 'the project\'s lint run, `blueprint inspect` rows fail `blueprint inspect` and '
    + 'never appear in a lint run, documentation-only rows are recorded intent with '
    + 'no gate behind them at any tier, and a row reading `nothing` is lint-gated in '
    + 'general but cannot emit on THIS blueprint — the cell says which fact rules it '
    + 'out. Every row reaches only the files a layer glob matches: a '
    + 'declared layer holding no code has nothing that can fail, which is runway rather '
    + 'than protection — `blueprint doctor` reports which of the two this repo has today.',
  ].join('\n');
}

/** Naming conventions, keyed by concept. */
export function renderNaming(naming: Record<string, string> | undefined): string {
  const entries = Object.entries(naming ?? {});

  if (!entries.length) return '';

  const rows = entries.map(([concept, convention]) => [
    `\`${concept}\``,
    escapeCell(convention),
  ]);

  return ['## Naming', '', table(['Concept', 'Convention'], rows)].join('\n');
}
