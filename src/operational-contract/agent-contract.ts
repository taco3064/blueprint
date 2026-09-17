function joinLine(...parts: string[]): string {
  return parts.join('');
}

const PACKAGED_AGENT_CONTRACT = [
  '# Blueprint agent operating discipline',
  '',
  joinLine(
    '> Shipped with `@kekkai/blueprint`. This is the ',
    '**generic** half of the',
  ),
  joinLine(
    '> architecture contract — the same for every project. The ',
    '**project** half',
  ),
  joinLine(
    '> (modules, layers, flow order, unit shapes, ownership, ',
    'naming, playbook) is compiled',
  ),
  joinLine(
    '> from `blueprint.config.mjs` into the repo\'s generated ',
    'handbook; the pointer',
  ),
  '> block in your agent context file links both.',
  '',
  '## The one-way flow',
  '',
  joinLine(
    '- `architecture.alias` is the sole canonical source-root ',
    'alias. Across a layer or',
  ),
  joinLine(
    '  module boundary, never substitute an `additionalAliases` ',
    'spelling.',
  ),
  joinLine(
    '- A layer may import only layers declared **after** it in ',
    'the blueprint —',
  ),
  joinLine(
    '  never upstream, never the same layer through the alias ',
    'inside its current module.',
  ),
  joinLine(
    '- In Module → Layer → Unit topology, a module may import ',
    'only itself and modules',
  ),
  joinLine(
    '  transitively reachable through its `dependsOn` edges. ',
    'Declaration order grants',
  ),
  joinLine(
    '  no permission, and the inner layer flow must ',
    'independently allow the import.',
  ),
  joinLine(
    '- Same-layer dependencies inside the current module use ',
    'relative paths, never the alias.',
  ),
  joinLine(
    '  Across modules, a reachable same-layer dependency uses ',
    'the alias so its module and',
  ),
  joinLine(
    '  layer identity remain explicit. In a folder-layout ',
    'layer, a sibling unit is reachable',
  ),
  joinLine(
    '  only through its declared entry; deeper paths stay ',
    'private. Shared code that does not',
  ),
  '  belong to either unit moves downward.',
  joinLine(
    '- Relative imports stay inside the importer\'s declared ',
    '**module and layer/position**.',
  ),
  joinLine(
    '  They never cross a module boundary. A module-root ',
    'container may reference another',
  ),
  joinLine(
    '  direct container file only inside its own module, but ',
    'reaches layer units through',
  ),
  joinLine(
    '  the alias so the structural rules can see the ',
    'dependency.',
  ),
  joinLine(
    '- Folder-layout units are **entry-only**: import the unit ',
    'path, never internals',
  ),
  '  behind its declared entry.',
  joinLine(
    '- Statically resolvable dynamic imports follow the same ',
    'alias, flow, and unit-entry',
  ),
  joinLine(
    '  rules. Runtime-dependent targets are an explicit ',
    'analysis limitation, never proof',
  ),
  '  that the import is legal.',
  '',
  '## When lint fails',
  '',
  joinLine(
    '- Fix the **structure** — move the code, or extract a ',
    'lower layer. The error',
  ),
  '  is the architecture speaking, not a formality.',
  joinLine(
    '- Never silence a structural rule with `eslint-disable`; ',
    'never "fix" a',
  ),
  joinLine(
    '  violation by relocating it to a sibling file the rule ',
    'does not cover yet.',
  ),
  joinLine(
    '- Every intentional disable of a *non-structural* rule ',
    'carries a reason',
  ),
  '  (`-- why`), or lint rejects it.',
  joinLine(
    '- Treat `warn`-tier results as review entry points: look, ',
    'then decide —',
  ),
  '  don\'t ignore, don\'t blindly appease.',
  '',
  '## When another tool disagrees',
  '',
  joinLine(
    '- Third-party lint advice sometimes collides with the ',
    'blueprint\'s unit',
  ),
  joinLine(
    '  shape — e.g. a fast-refresh rule asking you to split ',
    '`XxxContext` and',
  ),
  joinLine(
    '  `XxxProvider` into separate files, when the unit shape ',
    'says a context',
  ),
  joinLine(
    '  unit exports them together. **The blueprint is the ',
    'source of truth for',
  ),
  joinLine(
    '  structure**; the other tool\'s rule is triage, not a ',
    'verdict. Keep the',
  ),
  joinLine(
    '  blueprint shape and disable the conflicting rule ',
    'locally, with a reason.',
  ),
  joinLine(
    '- The reverse holds too: never use a third-party ',
    'suggestion as cover to',
  ),
  '  bypass a structural rule.',
  '',
  '## What no tool enforces (you are the gate)',
  '',
  joinLine(
    '- Do not create undeclared architectural folders under the ',
    'project alias root.',
  ),
  joinLine(
    '  Every such folder belongs to the declared topology: ',
    'Layer → Unit by default,',
  ),
  joinLine(
    '  or Module → Layer → Unit when `architecture.modules` is ',
    'declared — even as `[]`,',
  ),
  joinLine(
    '  a module-first runway with no domain module yet. ',
    '`blueprint inspect` catches this',
  ),
  joinLine(
    '  after the fact; you prevent it. Its finding directs you ',
    'to move the code into the',
  ),
  joinLine(
    '  declared layer (and module) that owns it. When none owns ',
    'it, a layer-first finding',
  ),
  joinLine(
    '  asks the owner whether the architecture should change; ',
    'a module-first finding sends',
  ),
  joinLine(
    '  owner-requested product work that needs a new domain ',
    'boundary to the module growth',
  ),
  '  protocol in the generated handbook.',
  joinLine(
    '  If the architecture has otherwise outgrown the config — ',
    'layers, rules, thresholds —',
  ),
  joinLine(
    '  report it and stop. Editing the architecture to fit code ',
    'you just wrote is how a',
  ),
  '  contract stops describing anything.',
  joinLine(
    '- Dead code: `npx knip` is the source of truth, not lint. ',
    'Confirm removal',
  ),
  joinLine(
    '  candidates before deleting; leave nothing "temporarily ',
    'kept" without a',
  ),
  '  marker the team agreed on.',
  '',
  '## Before you commit',
  '',
  joinLine(
    '- [ ] Imports use the canonical alias across boundaries ',
    'and pass the module DAG when configured and the one-way ',
    'layer flow (no upstream layers, local same-layer aliases, ',
    'or escaping relatives).',
  ),
  joinLine(
    '- [ ] Statically resolvable dynamic imports pass the same ',
    'checks; runtime-dependent targets have been reviewed ',
    'explicitly.',
  ),
  joinLine(
    '- [ ] New code sits in the right layer and, when ',
    'configured, module; folder units expose only their entry.',
  ),
  '- [ ] No new undeclared folders under the alias root.',
  joinLine(
    '- [ ] Names follow the project\'s conventions (see the ',
    'handbook).',
  ),
  joinLine(
    '- [ ] `npx blueprint inspect` (with `--baseline` on ',
    'brownfield repos) is green.',
  ),
  '',
  '## Where the project specifics live',
  '',
  '- `blueprint.config.mjs` — the single source of truth.',
  joinLine(
    '- The generated handbook (default ',
    '`docs/architecture-handbook.md`) — modules,',
  ),
  joinLine(
    '  layers, responsibilities, unit shapes, ownership, ',
    'naming, principles, playbook.',
  ),
  joinLine(
    '- `.blueprint-baseline.json` — accepted debt on brownfield ',
    'repos; the ratchet',
  ),
  '  fails only on **new** findings.',
].join('\n') + '\n';

export function renderPackagedAgentContract(): string {
  return PACKAGED_AGENT_CONTRACT;
}
