from pathlib import Path


def replace_between(path: str, start: str, end: str | None, replacement: str) -> None:
    p = Path(path)
    source = p.read_text()
    left = source.index(start)
    right = source.index(end, left + len(start)) if end else len(source)
    p.write_text(source[:left] + replacement.rstrip() + "\n\n" + source[right:])


p = Path('src/inspect/wiring.ts')
s = p.read_text().replace('.module.layout', '.unit.layout').replace('moduleLayout:', 'unitLayout:')
p.write_text(s)

p = Path('src/inspect/deps.ts')
s = p.read_text().replace("=== 'flat'", "=== 'file'").replace("'folder' | 'flat'", "'folder' | 'file'")
s = s.replace('flat layer', 'file-layout layer').replace('flat-layer', 'file-layout')
p.write_text(s)

p = Path('src/plugin/relative-escape.ts')
s = p.read_text()
s = s.replace(
    "interface RelativeProblem {\n  messageId: 'escapesSrc' | 'leavesLayer' | 'reachesInside';\n  data: Record<string, string>;\n}\n",
    "interface RelativeProblem {\n  messageId: 'escapesSrc' | 'leavesLayer' | 'reachesInside';\n  data: Record<string, string>;\n}\n\ninterface RelativeProblemContext {\n  resolved: ResolvedArchitecture;\n  own: ResolvedPosition;\n  dir: string[];\n}\n",
)
s = s.replace(
    '      const problem = relativeProblem(resolved, own, dir, specifier);',
    '      const problem = relativeProblem({ resolved, own, dir }, specifier);',
)
s = s.replace(
    "function relativeProblem(\n  resolved: ResolvedArchitecture,\n  own: ResolvedPosition,\n  dir: string[],\n  specifier: string,\n): RelativeProblem | null {",
    "function relativeProblem(\n  context: RelativeProblemContext,\n  specifier: string,\n): RelativeProblem | null {\n  const { resolved, own, dir } = context;",
)
p.write_text(s)

replace_between(
    'src/emit/docs/sections.ts',
    'export function renderModule(',
    'export function renderImportDiscipline(',
    '''export function renderModule(architecture: ArchitectureDef, exampleLayer: string): string {
  const resolved = resolveArchitecture(architecture);
  const shapes = resolved.layers.map((layer) => {
    const detail = layer.unit.layout === 'folder'
      ? `folder units; public entry \\`${layer.unit.entry}\\``
      : 'one file per unit';

    return `- \\`${layer.name}/\\` — ${detail}.`;
  });

  const topology = resolved.moduleFirst
    ? [
        'Modules are direct children of the source root. Each declared module reuses the same layer vocabulary below.',
        '',
        ...resolved.modules.map((module) => `- \\`${module.name}/\\` — ${module.definition.does}`),
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
    `Example layer: \\`${exampleLayer}/\\`.`,
  ].join('\\n');
}''',
)

replace_between(
    'src/emit/docs/sections.ts',
    'export function renderImportDiscipline(',
    'export function renderComponentShape(',
    '''export function renderImportDiscipline(architecture: ArchitectureDef): string {
  const resolved = resolveArchitecture(architecture);
  const bullets = [
    '- **One-way only** — a layer imports only from the layers below it; upstream imports are errors.',
    '- **No same-layer imports via the alias** — use a relative path inside the current architectural scope.',
  ];
  const folderEntries = [...new Set(
    resolved.layers
      .map((layer) => layer.unit)
      .filter((unit) => unit.layout === 'folder')
      .map((unit) => `\\`${unit.entry}\\``),
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
  ].join('\\n');
}''',
)

p = Path('src/emit/agent/sections.ts')
s = p.read_text().replace('placement, module shapes, ownership', 'placement, unit shapes, ownership')
s = s.replace('one-way imports, module entries, ownership', 'one-way imports, unit entries, ownership')
p.write_text(s)

replace_between(
    'src/emit/agent/sections.ts',
    'export function renderPlacement(',
    'export function renderNaming(',
    '''export function renderPlacement(architecture: ArchitectureDef): string {
  const resolved = resolveArchitecture(architecture);
  const lines = resolved.layers.map(({ definition: layer, root, allowedImporters, unit }) => {
    const location = resolved.moduleFirst ? `<module>/${layer.name}` : root ?? layer.name;
    const parts = [`- \\`${location}/\\` — ${layer.does}.`];

    if (layer.mustNot?.length) parts.push(` MUST NOT: ${layer.mustNot.join('; ')}.`);
    const owns = formatOwns(layer.owns);
    if (owns) parts.push(` OWNS: ${owns}.`);
    if (layer.allowedImporters) {
      const importers = allowedImporters
        .map((importer) => importer.selfOnly ? `${importer.layer} (selfOnly)` : importer.layer)
        .join(', ');
      parts.push(` IMPORTABLE BY: ${importers}.`);
    }
    parts.push(unit.layout === 'folder'
      ? ` UNIT: folder, public entry \\`${unit.entry}\\`; internals stay private.`
      : ' UNIT: one file.');
    return parts.join('');
  });

  const moduleLines = resolved.moduleFirst
    ? [
        '- Modules are declared direct children of the source root:',
        ...resolved.modules.map((module) => `  - \\`${module.root}/\\` — ${module.definition.does}.`),
      ]
    : [];
  const testGlobs = resolveTestFiles(architecture.testFiles);
  const exemptLine = testGlobs.length
    ? [`- Test support is exempt from placement rules where these globs match: ${testGlobs.map((glob) => `\\`${glob}\\``).join(' / ')}.`]
    : [];

  return ['### Where code goes', '', ...moduleLines, ...lines, ...exemptLine].join('\\n');
}''',
)

replace_between(
    'src/emit/agent/sections.ts',
    'export function renderHardRules(',
    'export function renderComponentShape(',
    '''export function renderHardRules(blueprint: Blueprint, stack: StackFacts = {}): string {
  const { architecture } = blueprint;
  const resolved = resolveArchitecture(architecture);
  const bullets = ['- Import only from downstream layers — never upstream.'];
  const folderEntries = [...new Set(
    resolved.layers
      .map((layer) => layer.unit)
      .filter((unit) => unit.layout === 'folder')
      .map((unit) => `\\`${unit.entry}\\``),
  )];

  if (folderEntries.length) bullets.push(`- Import folder units via their ${folderEntries.join(' / ')}, never their internals.`);
  bullets.push(
    '- Restricted packages / globals live only in their owning layer (see "Where code goes").',
    '- Relative imports stay inside the current architectural scope; no redundant segments (`./../`, `././`).',
  );

  for (const [id, setting] of emittableGates(blueprint, stack)) {
    const held = enforcedBy(id);
    const gate = gateLabel([id, setting]);
    if (held === 'lint') bullets.push(`- ${gate} is a hard gate.`);
    if (held === 'inspect') bullets.push(`- ${inspectDiagnosisClause(gate)}.`);
  }

  bullets.push('- When lint fails, fix the structure — never silence it with `eslint-disable`.');
  return ['### Machine checks', '', ...bullets].join('\\n');
}''',
)

replace_between(
    'src/emit/agent/sections.ts',
    'export function renderChecklist(',
    None,
    '''export function renderChecklist(blueprint: Blueprint): string {
  const { architecture, principles } = blueprint;
  const resolved = resolveArchitecture(architecture);
  const items = [
    '- [ ] Imports follow the declared one-way layer flow.',
    resolved.moduleFirst
      ? '- [ ] New code sits in the right declared module and shared inner layer.'
      : '- [ ] New code sits in the right layer.',
    '- [ ] Folder units expose only their configured public entry.',
  ];

  if (architecture.naming && Object.keys(architecture.naming).length) items.push('- [ ] Names follow the conventions above.');
  items.push(`- [ ] No new undeclared architectural folders under \\`${architecture.alias}/\\`.`);
  if (blueprint.componentShape?.length) items.push('- [ ] Changed units hold against every component-shape axis, judged one by one.');
  if (claudePrinciples(principles).length) items.push('- [ ] The behavioral principles above are upheld.');
  return ['### Before you commit', '', ...items].join('\\n');
}''',
)
