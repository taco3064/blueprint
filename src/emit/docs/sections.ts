import type {
  ArchitectureDef,
  AxisDef,
  Land,
  ModuleShapeGroup,
  PlaybookSection,
  PrincipleDef,
  RuleSetting,
} from '../../config';
import { folderEntries, readSetting, moduleShapeGroups, normalizeAllowedImporters } from '../../config';
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
    'Code flows one way: each layer may import only from the layers below it. Upstream imports are barred, and a same-layer import has exactly one legal shape — a relative path reaching the sibling\'s public surface, never the alias.',
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

/** The example folder tree for one shape, rooted at a layer that has it. */
function moduleTree(group: ModuleShapeGroup): string[] {
  const items: [string, string][] = [
    [group.entry, 'public entry — the only importable file'],
    ['Example', 'implementation (named after the module)'],
  ];

  return [
    '```',
    `${group.layers[0]}/`,
    '└─ Example/',
    ...items.map(([part, note], i) => {
      const connector = i === items.length - 1 ? '└─' : '├─';

      return `   ${connector} ${part.padEnd(7)} # ${note}`;
    }),
    '```',
  ];
}

/** What one shape is, from the word after "one" — the caller supplies the case. */
function moduleSentence(group: ModuleShapeGroup): string {
  return group.layout === 'folder'
    ? `module = one folder. Only \`${group.entry}\` is public; everything else stays private to the module.`
    : 'module = one file (flat layout).';
}

/**
 * Feature-folder shape, illustrated with a generated example tree. One shape is
 * stated as the project's; several are stated one by one, naming their layers —
 * there is no project-wide shape to state once the layers disagree.
 */
export function renderModule(architecture: ArchitectureDef): string {
  const groups = moduleShapeGroups(architecture);
  const folder = groups.filter((group) => group.layout === 'folder');

  const statement = groups.length === 1
    ? [`One ${moduleSentence(groups[0])}`]
    : [
        'The shape differs by layer:',
        '',
        ...groups.map((group) =>
          `- ${group.layers.map((layer) => `\`${layer}/\``).join(' / ')} — one ${moduleSentence(group)}`,
        ),
      ];

  return [
    '## Module shape',
    '',
    ...statement,
    // One tree however many folder shapes there are: the picture is the same at
    // every entry filename, and the statement above already names each one.
    ...(folder.length ? ['', ...moduleTree(folder[0])] : []),
  ].join('\n');
}

/** Prose for the boundaries the generated ESLint config enforces. */
export function renderImportDiscipline(architecture: ArchitectureDef): string {
  const { layers } = architecture;
  const groups = moduleShapeGroups(architecture);

  const hasSelfOnly = layers.some((layer) =>
    normalizeAllowedImporters(layer.allowedImporters).some((importer) => importer.selfOnly),
  );

  // Merged by layout, not by shape: this rule does not read the entry
  // filename, so two folder layers that name their entry differently would
  // otherwise get the same sentence twice, split on a difference it ignores.
  const layouts = [...new Set(groups.map((group) => group.layout))].map((layout) => ({
    layout,
    layers: groups.filter((group) => group.layout === layout).flatMap((group) => group.layers),
  }));

  const bullets = [
    '- **One-way only** — a layer imports only from the layers below it; upstream imports are errors.',
    ...layouts.map(({ layout, layers: scoped }) => {
      // One layout states the rule outright; both name their layers, because
      // the same sentence is false next door.
      const scope = layouts.length === 1
        ? ''
        : ` in ${scoped.map((layer) => `\`${layer}/\``).join(' / ')}`;

      // A folder layer's sibling IS reachable — through its entry, relatively.
      // Stated as a flat ban, the only remedy left is "extract to a lower
      // layer", which `blueprint/relative-escape` names as how a `utils/` junk
      // drawer gets built one honest decision at a time.
      return layout === 'flat'
        ? `- **No same-layer imports via the alias**${scope} — use a relative path instead.`
        : `- **No same-layer imports via the alias**${scope} — reach a sibling through its entry with a relative path (\`../Sibling\`), and never past that entry.`;
    }),
  ];

  const entries = folderEntries(architecture).map((entry) => `\`${entry}\``);

  if (entries.length) {
    bullets.push(
      `- **Entry-only** — import a module through its ${entries.join(' / ')}, never its internals.`,
    );
  }

  bullets.push(
    '- **No redundant relative segments** (`./../`, `././`) that bypass the rules.',
    '- **Ownership** — packages and globals are restricted to their owning layer (see the *Owns* column above).',
  );

  if (hasSelfOnly) {
    // States the RULE and leaves the notation to the legend that owns it — described
    // twice, the two answers drifted and the wrong one pointed at the edges that are
    // explicitly NOT dependencies.
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
