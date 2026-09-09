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

  const modules = resolved.modules.length
    ? [
        '### Modules',
        '',
        table(
          ['Module', 'Responsibility', 'Direct dependencies'],
          resolved.modules.map((module) => [
            `\`${module.name}\``,
            escapeCell(module.definition.does),
            module.dependsOn.length
              ? module.dependsOn.map((dependency) => `\`${dependency}\``).join(', ')
              : '—',
          ]),
        ),
        '',
        'Every module reuses the shared layer contract below. Module dependencies are transitive: '
        + 'a module may import itself and every downstream module reachable through `dependsOn`; '
        + 'declaration order grants no permission. An absent layer folder is runway.',
        '',
      ]
    : [];

  return [
    '## Architecture',
    '',
    'Code flows one way: each layer may import only from the layers below it. '
    + `Upstream imports and ${resolved.topology === 'module-first' ? 'same-module ' : ''}`
    + 'same-layer imports through the alias are barred.',
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
    ...modules,
    '### Layers',
    '',
    table(['Layer', 'Responsibility', 'Must not', 'Owns'], rows),
  ].join('\n');
}

export function renderUnit(architecture: ArchitectureDef): string {
  const resolved = resolveArchitecture(architecture);

  const rows = resolved.layers.map((layer) => [
    `\`${layer.name}\``,
    `\`${layer.unit.layout}\``,
    layer.unit.layout === 'folder' ? `\`${layer.unit.entry}\`` : '—',
  ]);

  return [
    '## Unit shape',
    '',
    'A unit is the code item inside a layer. Folder units expose only their entry; '
    + 'file units are one file each.',
    '',
    table(['Layer', 'Unit layout', 'Entry'], rows),
  ].join('\n');
}

export function renderImportDiscipline(architecture: ArchitectureDef): string {
  const resolved = resolveArchitecture(architecture);
  const hasSelfOnly = resolved.hasSelfOnly;

  const bullets = [
    '- **One-way only** — a layer imports only from the layers below it; '
    + 'upstream imports are errors.',
    `- **No ${resolved.topology === 'module-first' ? 'same-module ' : ''}`
    + 'same-layer imports via the alias** — use a relative path. File units may '
    + 'reach sibling files; folder units may reach a sibling only through its entry. '
    + 'Extract shared logic down to a lower layer when neither unit owns it.',
  ];

  if (resolved.topology === 'module-first') {
    bullets.unshift(
      '- **Module reachability** — a module may import only itself and modules reachable through '
      + 'its declared `dependsOn` edges. The inner layer flow must also allow the import.',
    );
  }

  const folderEntries = [
    ...new Set(
      resolved.layers
        .map((layer) => layer.unit)
        .filter((shape) => shape.layout === 'folder')
        .map((shape) => `\`${shape.entry}\``),
    ),
  ];

  if (folderEntries.length) {
    bullets.push(
      `- **Entry-only** — import a folder unit through its ${folderEntries.join(' / ')}, never its internals.`,
    );
  }

  bullets.push(
    '- **No redundant relative segments** (`./../`, `././`) that bypass the rules.',
    '- **Ownership** — packages and globals are restricted to their owning layer (see the *Owns* '
    + 'column above).',
  );

  if (hasSelfOnly) {
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
    + 'out. Every row reaches only the files the architecture globs match: a '
    + 'declared position holding no code has nothing that can fail, which is runway rather '
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
