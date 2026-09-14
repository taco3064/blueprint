export type OperationalDelivery = 'runtime' | 'generated' | 'checked-in';
export type OperationalChannel
  = | 'agent-contract'
    | 'authoring'
    | 'bootstrap'
    | 'cli'
    | 'field'
    | 'handbook'
    | 'transformation';

export interface OperationalSurface {
  id: string;
  owner: string;
  channel: OperationalChannel;
  delivery: OperationalDelivery;
  audiences: readonly string[];
  factProviders: readonly string[];
  consumers: readonly string[];
  targets: readonly string[];
  verification: readonly string[];
}

export const OPERATIONAL_SURFACES = [
  {
    id: 'agent-contract-sections', owner: 'agent.ts', channel: 'agent-contract',
    delivery: 'generated', audiences: ['coding agents'],
    factProviders: ['resolved Blueprint', 'measured lint integration'],
    consumers: ['src/emit/agent/sections.ts'], targets: ['AGENTS.md', 'CLAUDE.md'],
    verification: ['byte snapshots', 'emitter parity'],
  },
  {
    id: 'packaged-agent-contract', owner: 'agent-contract.ts', channel: 'agent-contract',
    delivery: 'checked-in', audiences: ['repository agents'],
    factProviders: ['static contract facts'],
    consumers: ['scripts/operational-compose.mjs'], targets: ['agent-contract.md'],
    verification: ['operational:check'],
  },
  {
    id: 'authoring-route', owner: 'authoring.ts', channel: 'authoring',
    delivery: 'runtime', audiences: ['adoption agents'], factProviders: ['survey', 'CLI topology'],
    consumers: ['src/bootstrap/authoring.ts'], targets: ['terminal instruction'],
    verification: ['topology contrast tests', 'source-root tests'],
  },
  {
    id: 'authoring-catalog', owner: 'authoring-catalog.ts', channel: 'authoring',
    delivery: 'generated', audiences: ['adoption agents'],
    factProviders: ['rule catalog', 'survey'],
    consumers: ['src/bootstrap/catalog.ts'], targets: ['blueprint-authoring.md'],
    verification: ['authoring snapshots'],
  },
  {
    id: 'authoring-eslint', owner: 'authoring-eslint.ts', channel: 'authoring',
    delivery: 'generated', audiences: ['adoption agents'],
    factProviders: [
      'project state', 'Blueprint', 'effective eslint owner', 'application base path',
    ],
    consumers: ['src/bootstrap/eslint.ts'], targets: ['eslint.config.blueprint.mjs'],
    verification: ['eslint config tests', 'nested-application conformance'],
  },
  {
    id: 'authoring-merge', owner: 'authoring-merge.ts', channel: 'authoring',
    delivery: 'generated', audiences: ['adoption agents'], factProviders: ['test-file policy'],
    consumers: ['src/bootstrap/merge.ts'], targets: ['blueprint-authoring.md'],
    verification: ['authoring snapshots'],
  },
  {
    id: 'authoring-method', owner: 'authoring-method.ts', channel: 'authoring',
    delivery: 'generated', audiences: ['adoption agents'], factProviders: ['launcher state'],
    consumers: ['src/bootstrap/method.ts'], targets: ['blueprint-authoring.md'],
    verification: ['authoring snapshots'],
  },
  {
    id: 'authoring-module-first', owner: 'authoring-module-first.ts', channel: 'authoring',
    delivery: 'generated', audiences: ['adoption agents'], factProviders: ['module-first topology'],
    consumers: ['src/bootstrap/module-first-playbook.ts'], targets: ['blueprint-authoring.md'],
    verification: ['topology contrast tests'],
  },
  {
    id: 'authoring-playbook', owner: 'authoring-playbook.ts', channel: 'authoring',
    delivery: 'generated', audiences: ['adoption agents'], factProviders: ['toolchain facts'],
    consumers: ['src/bootstrap/playbook.ts'], targets: ['blueprint-authoring.md'],
    verification: ['authoring snapshots'],
  },
  {
    id: 'authoring-verdict', owner: 'authoring-verdict.ts', channel: 'authoring',
    delivery: 'generated', audiences: ['adoption agents'], factProviders: ['survey verdict'],
    consumers: ['src/bootstrap/verdict.ts'], targets: ['blueprint-authoring.md'],
    verification: ['source-root tests', 'authoring snapshots'],
  },
  {
    id: 'bootstrap-actions', owner: 'bootstrap-actions.ts', channel: 'bootstrap',
    delivery: 'runtime', audiences: ['CLI users'], factProviders: ['bootstrap plan'],
    consumers: [
      'src/bootstrap/alias.ts',
      'src/bootstrap/authoring-launcher.ts',
      'src/bootstrap/bootstrap.ts',
      'src/bootstrap/legacy-upgrade.ts',
      'src/bootstrap/notes.ts',
      'src/bootstrap/plan.ts',
      'src/bootstrap/types.ts',
    ],
    targets: ['terminal actions'],
    verification: ['OperationalText type gate', 'AST bypass guard'],
  },
  {
    id: 'bootstrap-runtime-messages', owner: 'runtime-messages.ts', channel: 'bootstrap',
    delivery: 'runtime', audiences: ['CLI users', 'adoption agents'],
    factProviders: ['bootstrap state', 'project detection', 'resolved topology'],
    consumers: [
      'src/bootstrap/agent.ts',
      'src/bootstrap/authoring-launcher.ts',
      'src/bootstrap/bootstrap.ts',
      'src/bootstrap/contain.ts',
      'src/bootstrap/init-options.ts',
      'src/bootstrap/legacy-upgrade.ts',
      'src/bootstrap/notes.ts',
      'src/bootstrap/plan.ts',
      'src/bootstrap/preflight.ts',
      'src/bootstrap/repository-topology.ts',
      'src/bootstrap/topology.ts',
      'src/inspect/lint-runtime.ts',
      'src/project/blueprints.ts',
      'src/project/resolve.ts',
      'src/survey/module-mapping.ts',
    ],
    targets: ['init output', 'generated launcher and gitignore comments'],
    verification: ['runtime fact contrast tests', 'OperationalText type gate'],
  },
  {
    id: 'cli-errors', owner: 'cli-errors.ts', channel: 'cli',
    delivery: 'runtime', audiences: ['CLI users'], factProviders: ['parsed CLI facts'],
    consumers: ['src/cli/args.ts'], targets: ['stderr'], verification: ['CLI error tests'],
  },
  {
    id: 'cli-help', owner: 'cli-help.ts', channel: 'cli',
    delivery: 'runtime', audiences: ['CLI users'], factProviders: ['command registry'],
    consumers: ['src/cli/cli.ts', 'src/cli/help.ts'], targets: ['stdout'],
    verification: ['command coverage tests'],
  },
  {
    id: 'validation-errors', owner: 'validation-errors.ts', channel: 'cli',
    delivery: 'runtime', audiences: ['CLI users', 'configuration authors'],
    factProviders: ['config validation', 'module graph validation', 'markdown composition'],
    consumers: [
      'src/bootstrap/plan.ts', 'src/emit/agent/agent.ts', 'src/emit/agent/targets.ts',
      'src/emit/docs/docs.ts', 'src/presets/presets.ts', 'src/project/blueprints.ts',
      'src/project/resolve.ts',
    ],
    targets: ['config-load errors', 'init errors', 'composition errors', 'emitter errors'],
    verification: ['validation message tests', 'OperationalText type gate', 'AST bypass guard'],
  },
  {
    id: 'field-prompt', owner: 'field-prompt.ts', channel: 'field',
    delivery: 'checked-in', audiences: ['field agents'], factProviders: ['selected topology'],
    consumers: ['scripts/operational-compose.mjs'], targets: ['scripts/field-prompt.md'],
    verification: ['operational:check', 'topology contrast tests'],
  },
  {
    id: 'doctor-diagnostics', owner: 'doctor.ts', channel: 'cli',
    delivery: 'runtime', audiences: ['CLI users', 'adoption agents'],
    factProviders: [
      'doctor checks', 'repository state', 'effective lint integration', 'alias consumer evidence',
    ],
    consumers: [
      'src/inspect/doctor-lint.ts', 'src/inspect/doctor.ts',
      'src/inspect/wiring.ts',
    ],
    targets: ['doctor text and JSON'],
    verification: ['doctor contrast tests', 'alias consumer contrast tests'],
  },
  {
    id: 'doctor-report', owner: 'doctor-report.ts', channel: 'cli',
    delivery: 'runtime', audiences: ['CLI users', 'adoption agents'],
    factProviders: ['doctor checks', 'current-config adoption scope'],
    consumers: ['src/inspect/doctor.ts'],
    targets: ['doctor report text and JSON'],
    verification: ['doctor report contrast tests'],
  },
  {
    id: 'dependency-diagnostics', owner: 'deps.ts', channel: 'cli',
    delivery: 'runtime', audiences: ['CLI users', 'adoption agents'],
    factProviders: ['dependency graph', 'resolved architecture', 'test-file reach'],
    consumers: ['src/inspect/deps.ts'], targets: ['deps text output'],
    verification: ['dependency report contrast tests', 'operational sink guard'],
  },
  {
    id: 'finding-diagnostics', owner: 'findings.ts', channel: 'cli',
    delivery: 'runtime', audiences: ['CLI users'], factProviders: ['inspection findings'],
    consumers: ['src/inspect/analyze.ts', 'src/inspect/dependency.ts', 'src/inspect/folders.ts'],
    targets: ['inspect text and JSON'], verification: ['finding matrix tests'],
  },
  {
    id: 'inspect-diagnostics', owner: 'inspect.ts', channel: 'cli',
    delivery: 'runtime', audiences: ['CLI users', 'adoption agents'],
    factProviders: ['coverage', 'baseline state'],
    consumers: [
      'src/inspect/baseline.ts', 'src/inspect/coverage.ts', 'src/inspect/inspect.ts',
      'src/inspect/report.ts',
    ],
    targets: ['inspect text and JSON'], verification: ['baseline and coverage contrast tests'],
  },
  {
    id: 'rules-diagnostics', owner: 'rules.ts', channel: 'cli',
    delivery: 'runtime', audiences: ['CLI users', 'adoption agents'],
    factProviders: ['resolved rule catalog'], consumers: ['src/inspect/rules.ts'],
    targets: ['rules text and JSON'], verification: ['rules report tests'],
  },
  {
    id: 'survey-diagnostics', owner: 'survey.ts', channel: 'cli',
    delivery: 'runtime', audiences: ['CLI users', 'adoption agents'],
    factProviders: ['survey measurements', 'scope resolution'],
    consumers: ['src/project/scope.ts', 'src/survey/render.ts'],
    targets: ['survey text'], verification: ['survey contrast tests'],
  },
  {
    id: 'architecture-handbook', owner: 'handbook.ts', channel: 'handbook',
    delivery: 'generated', audiences: ['repository maintainers'],
    factProviders: ['resolved Blueprint', 'measured lint integration'],
    consumers: ['src/emit/docs/sections.ts'], targets: ['docs/architecture-handbook.md'],
    verification: ['byte snapshots', 'emitter parity'],
  },
  {
    id: 'impact-guidance', owner: 'impact.ts', channel: 'cli',
    delivery: 'runtime', audiences: ['CLI users', 'adoption agents'],
    factProviders: ['impact measurements', 'dependency resolution'],
    consumers: ['src/impact/impact.ts'], targets: ['impact text output'],
    verification: ['impact report contrast tests', 'byte parity'],
  },
  {
    id: 'lint-guidance', owner: 'lint.ts', channel: 'bootstrap',
    delivery: 'generated', audiences: ['CLI users', 'adoption agents'],
    factProviders: ['lint policy', 'resolved architecture'],
    consumers: [
      'src/emit/lint/container.ts', 'src/emit/lint/lint.ts',
      'src/emit/lint/structural.ts',
    ],
    targets: ['generated ESLint rules', 'rules and impact output'],
    verification: ['lint message matrix tests', 'byte parity'],
  },
  {
    id: 'test-file-policy', owner: 'test-files.ts', channel: 'bootstrap',
    delivery: 'runtime', audiences: ['CLI users', 'adoption agents'],
    factProviders: ['resolved testFiles'],
    consumers: ['src/emit/lint/patterns.ts', 'src/inspect/rules.ts'],
    targets: ['CLI findings', 'generated playbooks'],
    verification: ['locale and surface matrix tests'],
  },
  {
    id: 'transformation-runtime', owner: 'transformation.ts', channel: 'transformation',
    delivery: 'runtime', audiences: ['transformation agents'],
    factProviders: ['preflight findings'],
    consumers: [
      'src/bootstrap/module-to-layer-transformation.ts',
      'src/bootstrap/transformation.ts',
      'src/bootstrap/transformation-resume.ts',
      'src/project/transformation-obligation.ts',
    ],
    targets: ['terminal actions'],
    verification: ['transformation tests'],
  },
  {
    id: 'layer-to-module-playbook', owner: 'transformation-layer-to-module.ts',
    channel: 'transformation', delivery: 'generated', audiences: ['transformation agents'],
    factProviders: ['layer-first evidence'],
    consumers: ['src/bootstrap/transformation-playbook.ts'],
    targets: ['transformation playbook'], verification: ['transformation snapshots'],
  },
  {
    id: 'module-to-layer-playbook', owner: 'transformation-module-to-layer.ts',
    channel: 'transformation', delivery: 'generated', audiences: ['transformation agents'],
    factProviders: ['module-first evidence'],
    consumers: ['src/bootstrap/module-to-layer-playbook.ts'],
    targets: ['transformation playbook'], verification: ['transformation snapshots'],
  },
  {
    id: 'repository-transformation', owner: 'transformation-repository.ts',
    channel: 'transformation', delivery: 'generated', audiences: ['transformation agents'],
    factProviders: ['repository router facts'],
    consumers: ['src/bootstrap/repository-transformation.ts'],
    targets: ['repository transformation playbook'], verification: ['transformation snapshots'],
  },
] as const satisfies readonly OperationalSurface[];
