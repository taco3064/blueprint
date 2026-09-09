import type {
  ArchitectureDef,
  AxisDef,
  Land,
  PlaybookSection,
  PrincipleDef,
  RuleSetting,
} from '../../config';
import {
  readSetting,
  resolveArchitecture,
} from '../../config';
import { enforcedBy, unavailableForEmit } from '../lint';
import type { EmitFacts } from '../lint';
import { escapeCell, formatOwns, table } from '../../markdown';
import { emitFlowDiagram } from './diagram';

export function renderHeader(name: string | undefined): string {
  const title = name ? `${name} — Architecture Handbook` : 'Architecture Handbook';

  return [
    `# ${title}`,
    '',
    '> Generated from `blueprint.config` by `@kekkai/blueprint` — edit the blueprint, '
    + 'not this file.',
  ].join('\n');
}

export function renderArchitecture(architecture: ArchitectureDef): string {
  const resolved = resolveArchitecture(architecture);

  const rows = resolved.layers.map(({ definition: layer }) => [
    `\`${layer.name}\``,
    escapeCell(layer.does),
    layer.mustNot?.length ? escapeCell(layer.mustNot.join('; ')) : '—',
    formatOwns(layer.owns) || '—',
  ]);

  return [
    '## Architecture',
    '',
    'Code flows one way: each layer may import only from the layers below it. '
    + 'Upstream and same-layer imports are barred.',
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

export function renderModule(architecture: ArchitectureDef, exampleLayer: string): string {
  const resolved = resolveArchitecture(architecture);

  const shapes = resolved.layers.map((layer) => {
    const detail = layer.unit.layout === 'folder'
      ? `folder units; public entry \`${layer.unit.entry}\``
      : 'one file per unit';

    return `- \`${layer.name}/\` — ${detail}.`;
  });

  const topology = resolved.moduleFirst
    ? [
        'Modules are direct children of the source root. Each declared module reuses the same layer vocabulary below.',
        '',
        ...resolved.modules.map((module) => `- \`${module.name}/\` — ${module.definition.does}`),
        '',
      ]
    : [];

  return [
    '## Unit shape',
    '',
    ...topology,
    'A unit is the file or folder inside a layer. Unit layout is configured per layer:',
    '',
    ...shapes,
    '',
    `Example layer: \`${exampleLayer}/\`.`,
  ].join('\n');
}

export function renderImportDiscipline(architecture: ArchitectureDef): string {
  const resolved = resolveArchitecture(architecture);

  const bullets = [
    '- **One-way only** — a layer imports only from the layers below it; upstream imports are errors.',
    '- **No same-layer imports via the alias** — use a relative path inside the current architectural scope.',
  ];

  const folderEntries = [...new Set(
    resolved.layers
      .map((layer) => layer.unit)
      .filter((unit) => unit.layout === 'folder')
      .map((unit) => `\`${unit.entry}\``),
  )];

  if (folderEntries.length) {
    bullets.push(`- **Entry-only** — import a folder unit through its ${folderEntries.join(' / ')}, never its internals.`);
  }

  bullets.push(
    '- **No redundant relative segments** (`./../`, `././`) that bypass the rules.',
    '- **Ownership** — packages and globals are restricted to their owning layer (see the *Owns* column above).',
  );

  if (resolved.moduleFirst) {
    bullets.push('- **Module identity is declared** — source-root module folders come from `architecture.modules`; names such as `shared` and `app` have no special privilege.');
  }

  if (resolved.hasSelfOnly) {
    bullets.push('- **selfOnly** — a permitted importer may depend on the target layer but must never re-export it onward.');
  }

  return [
    '## Import discipline',
    '',
    'These boundaries are enforced by the generated ESLint config — one blueprint drives both:',
    '',
    ...bullets,
  ].join('\n');
}

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

export function renderRules(
  rules: Record<string, RuleSetting> | undefined,

  facts: EmitFacts = {},
): string {
  const entries = Object.entries(rules ?? {});

  if (!entries.length) {
    return '';
  }

  const HELD_BY = {
    lint: 'lint',
    inspect: '`blueprint inspect`',
    docs: 'documentation only',
  } as const;

  const rows = entries.map(([id, setting]) => {
    const { tier, value } = readSetting(setting);

    const unavailable = unavailableForEmit(id, facts);

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
