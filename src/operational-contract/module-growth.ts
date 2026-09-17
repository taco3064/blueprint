export interface ModuleGrowthFacts {
  runway: boolean;
}

export const MODULE_GROWTH_TITLE = 'Module growth protocol';

export function renderModuleRunwayFact(): string {
  return '`architecture.modules` declares no domain module yet — a module-first runway: the '
    + 'topology is declared, the inner layers, rules, principles, and playbook already apply, and '
    + 'no domain module exists because no product requirement has evidenced one. The absence is '
    + 'intended, not incomplete adoption.';
}

export function renderModuleGrowthAuthority(handbook: string): string {
  return `When owner-requested product work needs a boundary no declared module owns, follow the ${MODULE_GROWTH_TITLE.toLowerCase()} in [${handbook}](${handbook}): `
    + 'a temporary layer-first projection for reasoning only (route/page composition → '
    + 'container/use-case seeds → ownership closures), merge or split the seeds, then materialize '
    + 'Module → Layer → Unit and derive `dependsOn` from the real imports — never one module per '
    + 'screen, hook, service, entity, or request noun, and never a catch-all `shared`. Changing '
    + 'inner layers, rules, or thresholds is the owner\'s decision — say so and stop.';
}

export function renderModuleGrowthProtocol(
  facts: ModuleGrowthFacts,
  heading: '##' | '###',
): string {
  return [
    `${heading} ${MODULE_GROWTH_TITLE}`,
    '',
    facts.runway
      ? renderModuleRunwayFact()
      : 'The declared modules are the current domain authority; new domain boundaries come only '
        + 'from this protocol.',
    '',
    'When owner-requested product work adds behavior, or materially reshapes behavior, that no '
    + 'declared module owns:',
    '',
    ...MODULE_GROWTH_STEPS.map((step, index) => `${index + 1}. ${step}`),
    '',
    'Inner layers, rules, and thresholds are outside this protocol: changing them remains the '
    + 'owner\'s decision.',
  ].join('\n');
}

export function renderModuleDecompositionSteps(): string[] {
  return MODULE_GROWTH_STEPS.slice(0, 5);
}

const MODULE_GROWTH_STEPS = [
  '**Never derive a module from vocabulary.** A request noun, screen, route segment, hook, '
  + 'service, entity, or existing top-level folder is not a module by itself; one module per '
  + 'screen, hook, service, entity, or noun is the wrong decomposition.',
  '**Project the behavior onto a temporary layer-first model, for reasoning only.** Trace '
  + 'route/page composition → the container/use-case responsibilities it composes → the '
  + 'components, hooks, contexts, services, and other units each responsibility needs. The '
  + 'projection is analysis, not topology: never describe this repository as layer-first, never '
  + 'write a layer-first config, and never run `blueprint init --topology` or a topology '
  + 'transformation to perform it.',
  '**Treat each container/use-case responsibility as a module seed,** and associate every unit '
  + 'with the responsibility closures that use it.',
  '**Merge related seeds; split only independent ones.** Several screens or use cases of one '
  + 'business responsibility are one module. Split a seed only where its responsibilities are '
  + 'genuinely independent.',
  '**Keep domain-owned code with its owner.** Code with a clear domain owner stays in that module '
  + 'even when several modules consume it; they depend on it. Extract only genuinely neutral code, '
  + 'into a module named for what it is (for example `platform` or `ui`) — never a catch-all '
  + '`shared`, `common`, or `core`.',
  '**Materialize Module → Layer → Unit only after ownership is decided.** Declare each module in '
  + 'the config\'s `modules` (`architecture.modules`, or the `modules` option of `reactPreset` / '
  + '`vuePreset`) with a precise `does`. Its root files take the container position — the role a '
  + 'layer-first container plays, never an inner `containers` layer — and may import, through unit '
  + 'entries, every inner layer of their own module and of modules reachable through `dependsOn`. '
  + 'Units go into the declared inner layers. Route/page composition belongs to the reserved `app` '
  + 'module once routes exist.',
  '**Derive `dependsOn` from the resulting imports.** A module that imports another declares it '
  + 'as a direct dependency. Never add an edge only to make a boundary check pass, and never leave '
  + 'a real edge undeclared.',
  '**Regenerate and verify.** Run `npx blueprint init` so lint, the handbook, and the agent '
  + 'contracts include the new module, then `npx blueprint inspect`.',
];
