import type {
  ArchitectureDef,
  AxisDef,
  Land,
  ModuleDef,
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

  // Under `modules` this flow is the INNER one — the layers sit inside each
  // module, and the module order above is a second flow. Unqualified, the
  // sentence reads as the whole architecture and the module dimension
  // disappears into it, which is what a modular handbook did until now.
  const scope = architecture.modules ? ' inside each module' : '';

  return [
    '## Architecture',
    '',
    `Code flows one way${scope}: each layer may import only from the layers below it. Upstream imports are barred, and a same-layer import has exactly one legal shape — a relative path reaching the sibling's public surface, never the alias.`,
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

/** The directory the layers live under — `src` unless the blueprint moves it. */
function sourceRoot(architecture: ArchitectureDef): string {
  return architecture.sourceRoot ?? 'src';
}

/**
 * The example folder tree for one shape, rooted at a layer that has it. Flat
 * projects only: under `modules` the same picture is drawn at full depth by
 * {@link renderModules}, and two drawings of one tree are two things to keep in
 * step.
 */
function unitTree(group: ModuleShapeGroup): string[] {
  const items: [string, string][] = [
    [group.entry, 'public entry — the only importable file'],
    ['Example', 'implementation (named after the unit)'],
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
function unitSentence(group: ModuleShapeGroup): string {
  return group.layout === 'folder'
    ? `unit = one folder. Only \`${group.entry}\` is public; everything else stays private to the unit.`
    : 'unit = one file (file layout).';
}

/**
 * The module's own entry filename. Fixed, unlike a layer's `entry` — the ban on
 * reaching up to a module root is written against this one spelling, so a
 * reader who assumes `layers[].entry` applies here is looking for the wrong file.
 */
const MODULE_ENTRY = 'index';

/**
 * The tree at full depth: module, its root entry, a layer inside it, and a unit
 * inside that. Drawn only under `modules`, where the flat tree would be rooted
 * at a folder the config does not have — the layer name at the source root is an
 * undeclared module there, which `inspect` reports as an error.
 */
function modularTree(architecture: ArchitectureDef, modules: ModuleDef[]): string[] {
  const layered = modules.find((module) => module.layers !== false);
  const group = moduleShapeGroups(architecture).find((entry) => entry.layout === 'folder');

  // The second row is a `layers: false` module when one is declared — that is
  // the arm carrying a fact the first row cannot show — and otherwise the next
  // declared module, so a tree of two modules never draws as a tree of one.
  const second = modules.find((module) => module.layers === false)
    ?? modules.find((module) => module !== layered);

  // The layered arm is drawn last when it is the only arm, so the `│` spine
  // under it stops rather than running past the last row.
  const spine = second && layered ? '│' : ' ';

  const inner: [string, string][] = layered === undefined
    ? []
    : [
        [`${spine}  ├─ ${MODULE_ENTRY}`, `the module's public surface — always \`${MODULE_ENTRY}\``],
        [`${spine}  └─ ${architecture.layers[0].name}/`, 'a layer, inside the module'],
        ...(group
          ? [
              [`${spine}     └─ Example/`, ''] as [string, string],
              [`${spine}        ├─ ${group.entry}`, 'the unit\'s entry — the only importable file'] as [string, string],
              [`${spine}        └─ Example`, 'implementation (named after the unit)'] as [string, string],
            ]
          : [[`${spine}     └─ Example`, 'one file per unit (file layout)'] as [string, string]]),
      ];

  const rows: [string, string][] = [
    [`${sourceRoot(architecture)}/`, ''],
    ...(layered
      ? [[`${second ? '├' : '└'}─ ${layered.name}/`, 'a module — its root composes the layers below'] as [string, string]]
      : []),
    ...inner,
    ...(second
      ? [[
          `└─ ${second.name}/`,
          second.layers === false
            ? '`layers: false` — governed, but not layered'
            : 'another module — same shape, its own layers',
        ] as [string, string]]
      : []),
  ];

  const width = Math.max(...rows.map(([left]) => left.length));

  return [
    '```',
    ...rows.map(([left, note]) => (note ? `${left.padEnd(width)}  # ${note}` : left)),
    '```',
  ];
}

/**
 * The outer level: what the declared modules are, what each may reach, and where
 * a layer actually lives once modules exist. Empty on a flat project, which has
 * one implicit module and nothing to tabulate.
 *
 * The import rules are NOT here — every import boundary, layer and module alike,
 * is stated once in `renderImportDiscipline`, because an agent asking "may I
 * import this" reads one list or reads two that drift.
 */
export function renderModules(architecture: ArchitectureDef): string {
  const { modules } = architecture;

  if (!modules) return '';

  const rows = modules.map((module) => [
    `\`${module.name}\``,
    escapeCell(module.does),
    module.imports?.length ? module.imports.map((name) => `\`${name}\``).join(', ') : '—',
    module.layers === false ? 'no (`layers: false`)' : 'yes',
    formatOwns(module.owns) || '—',
  ]);

  return [
    '## Modules',
    '',
    `\`${sourceRoot(architecture)}/\` holds feature modules, and the layers below sit inside each one — a layer has no folder of its own, so its address is \`${sourceRoot(architecture)}/<module>/<layer>/\`.`,
    'Declaration order is the outer flow: a module may name only modules declared after it, which is what keeps that graph acyclic without a cycle check.',
    '',
    table(['Module', 'Responsibility', 'May import', 'Layered', 'Owns'], rows),
    '',
    ...modularTree(architecture, modules),
    '',
    // The `layers: false` row above says which module it is; this says what the
    // word costs, which the table cannot. Stated whether or not one is declared:
    // the column is there either way, and a reader meeting `yes` needs to know
    // what the other value would have meant.
    'A module declared `layers: false` opts out of the inner layer vocabulary and out of nothing else: its `imports`, the entry-only ban, `owns`, the metric gates and coverage all still reach inside it.',
  ].join('\n');
}

/**
 * Unit shape — how one thing inside a layer is laid out, illustrated with a
 * generated example tree. One shape is stated as the project's; several are
 * stated one by one, naming their layers — there is no project-wide shape to
 * state once the layers disagree.
 *
 * "Unit", not "module": under `architecture.modules` a module is the feature at
 * the source root, and `deps` and the emitted lint messages already name this
 * inner thing a unit.
 */
export function renderUnitShape(architecture: ArchitectureDef): string {
  const groups = moduleShapeGroups(architecture);
  const folder = groups.filter((group) => group.layout === 'folder');

  const statement = groups.length === 1
    ? [`One ${unitSentence(groups[0])}`]
    : [
        'The shape differs by layer:',
        '',
        ...groups.map((group) =>
          `- ${group.layers.map((layer) => `\`${layer}/\``).join(' / ')} — one ${unitSentence(group)}`,
        ),
      ];

  return [
    '## Unit shape',
    '',
    ...statement,
    // One tree however many folder shapes there are: the picture is the same at
    // every entry filename, and the statement above already names each one.
    // None at all under `modules` — `renderModules` drew it at full depth.
    ...(folder.length && !architecture.modules ? ['', ...unitTree(folder[0])] : []),
  ].join('\n');
}

/**
 * The three module boundaries, in the same list as the layer ones — none of
 * them is derivable from the layer rules, and each is a rule an agent breaks
 * while believing it is helping.
 */
function renderModuleBullets(architecture: ArchitectureDef): string[] {
  if (!architecture.modules) return [];

  return [
    `- **A module reaches only what it declares** — \`imports\` is the whole list, and each entry is reachable through that module's entry alone (\`${architecture.alias}/<module>\`). Omitting \`imports\` means none: a module is isolated until it names a dependency, which is the opposite of the layer default. A relative path across a module boundary is never the answer, whatever it resolves to.`,
    '- **Nothing inside a module imports its own root** — the root composes the layers, so the traffic runs downward only. Move the shared part down into a layer, or pass it in from the root.',
    // The width matters more than the ban: entry-only would leave a two-hop
    // bypass (an inner file re-exports, the entry re-exports that file), so the
    // shipped rule is module-wide and the prose has to say so, or a reader who
    // cannot check it builds the bypass believing it is legal.
    '- **Never re-export another module\'s surface through your own** — in **every file of the module**, not only its entry, and in any spelling: a consumer that needs it declares that module itself. A wrapper expressing this module\'s own responsibility is fine; a wrapper added only to clear the rule is the non-fix — it goes green and builds nothing.',
  ];
}

/**
 * The one gap the emitted config cannot cover, in the vocabulary of whichever
 * structure is declared. Both finding ids carry `ENFORCED_BY: null` by
 * construction — the globs are built FROM the declared names, so a folder
 * nobody declared is matched by nothing, and a loop that ends at a green lint
 * never learns of it.
 */
function renderUndeclaredCaveat(architecture: ArchitectureDef): string {
  const root = sourceRoot(architecture);

  if (architecture.modules) {
    return `- **A folder nobody declared is outside every rule above.** A new top-level folder under \`${root}/\` matches no glob, so no lint rule can see it — \`undeclared-module\` is the only thing that does, and it never appears in a lint run. It is also outside every module ban, so a module boundary can be broken inside it with lint fully green. A green lint after creating a folder proves nothing about it: \`blueprint inspect --baseline\` is where that answer comes from.`;
  }

  return `- **A folder nobody declared is outside every rule above.** A new top-level folder under \`${root}/\` is matched by no layer glob, so no lint rule can see it — \`undeclared-folder\` is the only thing that does, and it never appears in a lint run. A green lint after creating a folder proves nothing about it: \`blueprint inspect --baseline\` is where that answer comes from.`;
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
    ...renderModuleBullets(architecture),
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
      return layout === 'file'
        ? `- **No same-layer imports via the alias**${scope} — use a relative path instead.`
        : `- **No same-layer imports via the alias**${scope} — reach a sibling through its entry with a relative path (\`../Sibling\`), and never past that entry.`;
    }),
  ];

  const entries = folderEntries(architecture).map((entry) => `\`${entry}\``);

  if (entries.length) {
    bullets.push(
      `- **Entry-only** — import a unit through its ${entries.join(' / ')}, never its internals.`,
    );
  }

  bullets.push(
    '- **No redundant relative segments** (`./../`, `././`) that bypass the rules.',
    // Ownership is two-dimensional once modules exist — `ModuleDef.owns` bars a
    // primitive in every OTHER module, exactly as a layer's bars every other
    // layer. Said only of layers, the sentence is false on any config that sets
    // the module-level one, and the Owns column it points at is a layer column.
    architecture.modules
      ? '- **Ownership** — packages and globals are restricted to their owner, and there are two kinds: a layer\'s `owns` bars every other layer (the *Owns* column above), a module\'s bars every other module (the *Owns* column under **Modules**).'
      : '- **Ownership** — packages and globals are restricted to their owning layer (see the *Owns* column above).',
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

  // Last, because it is the one bullet that says where the list above STOPS.
  bullets.push(renderUndeclaredCaveat(architecture));

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
