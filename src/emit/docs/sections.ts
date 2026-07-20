import type {
  ArchitectureDef,
  AxisDef,
  Land,
  PlaybookSection,
  PrincipleDef,
  RuleSetting,
} from '../../config';
import { getModuleShape, normalizeAllowedImporters } from '../../config';
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
    '### Layers',
    '',
    table(['Layer', 'Responsibility', 'Must not', 'Owns'], rows),
  ].join('\n');
}

/** Feature-folder shape, illustrated with a generated example tree. */
export function renderModule(architecture: ArchitectureDef, exampleLayer: string): string {
  const { module } = architecture;

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
  const { module, layers } = architecture;

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
    bullets.push(
      '- **selfOnly** — a dashed edge may be depended on but never re-exported onward.',
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
export function renderRules(rules: Record<string, RuleSetting> | undefined): string {
  const entries = Object.entries(rules ?? {});

  if (!entries.length) return '';

  const rows = entries.map(([id, setting]) => {
    const tier = typeof setting === 'string' ? setting : setting.tier;
    const value = typeof setting === 'string' ? undefined : setting.value;

    return [`\`${id}\``, `\`${tier}\``, value === undefined ? '—' : `\`${value}\``];
  });

  return [
    '## Rules',
    '',
    table(['Rule', 'Tier', 'Option'], rows),
    '',
    '`error` fails CI · `warn` is advisory · `off` is disabled.',
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
