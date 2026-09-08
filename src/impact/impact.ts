import path from 'node:path';
import type { ESLint as EslintNamespace, Linter } from 'eslint';

import { emitLint, resolveLayerFiles } from '../emit/lint';
import type { LintConfigEntry } from '../emit/lint';
import { expectedCarriers } from '../inspect';
import type { Blueprint } from '../config';
import { detect, loadProjectModule, resolveBlueprint, unwrapModule } from '../project';
import type { ResolveOptions } from '../project';

/**
 * `blueprint impact` — the rule-impact dry-run: build the emitted config, run the
 * PROJECT'S OWN ESLint over the layer files with only that config, report hits per
 * rule. Informational, never a gate — the exit code stays 0.
 */

export interface ImpactOptions {
  /** Emit machine-readable JSON instead of the text report. */
  json?: boolean;
  /** Output sink (default `console.log`). */
  log?: (message: string) => void;
  /** Load a module from the project's dependency tree (default: real import). */
  loadModule?: (name: string, root: string) => Promise<unknown>;
  /** Load an existing blueprint.config (default dynamic import). */
  loadConfig?: ResolveOptions['loadConfig'];
}

/** One emitted rule's footprint on the current code. */
export interface RuleImpact {
  rule: string;
  /** Total messages the rule would produce. */
  count: number;
  /** Distinct files it fires in. */
  files: number;
  /** The heaviest files, worst first (capped at five). */
  top: { path: string; count: number }[];
  /**
   * True when the rule id is NOT part of the emitted config — an artifact of linting
   * in isolation, not counted in the total. `count` is then MENTIONS and its location
   * the directive, so nothing here says the code beneath it violates anything (#146).
   */
  foreign: boolean;
}

interface EslintApi {
  ESLint: new (options: object) => {
    lintFiles: (patterns: string[]) => Promise<
      { filePath: string; messages: { ruleId: string | null; fatal?: boolean }[] }[]
    >;
  };
}

interface TsEslintApi {
  parser: Linter.Parser;
  plugin: EslintNamespace.Plugin;
}

async function loadStack(
  load: (name: string, root: string) => Promise<unknown>,
  root: string,
  name: string,
): Promise<unknown> {
  try {
    return await load(name, root);
  } catch (error) {
    throw new Error(
      `impact needs "${name}" from the project's dependencies and could not load it. `
      + `The loader said: ${error instanceof Error ? error.message : String(error)}\n`
      + `If that names a DIFFERENT package, "${name}" itself is here and its own dependency `
      + `tree is not: a full install of the project fills that, adding "${name}" again does `
      + 'not. (`blueprint init` lists it among the required deps.)',
    );
  }
}

/**
 * Run `blueprint impact` in `root`. Read-only; requires an authored config.
 * Compiles the blueprint with `emitLint`, lints the layer files with only
 * that config through the project's own ESLint, and reports what wiring
 * would flag today — per rule, with the heaviest files named.
 * @group Runtimes
 * @example
 * const { impacts, total } = await runImpact(process.cwd());
 */
export async function runImpact(
  root: string,
  options: ImpactOptions = {},
): Promise<{ impacts: RuleImpact[]; total: number }> {
  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);

  if (!state.hasConfig) {
    throw new Error(
      'impact measures the rules of an authored blueprint.config.mjs — author the config first '
      + '(`blueprint init`, or the authoring playbook on a brownfield repo).',
    );
  }

  const { blueprint } = await resolveBlueprint(root, state, options);

  const framework
    = blueprint.framework !== 'auto' ? blueprint.framework : state.framework ?? 'auto';

  const stack = await loadImpactStack(root, blueprint, {
    load: options.loadModule ?? loadProjectModule,
    framework,
    hasTypescript: state.hasTypescript,
  });

  const config = impactConfig(blueprint, framework, stack);
  const results = await lintLayers(root, blueprint, { ESLint: stack.ESLint, config });
  const impacts = tallyImpacts(results, root, emittedRuleIds(config));

  const total = impacts
    .filter((impact) => !impact.foreign && !SPECIAL_ROWS.has(impact.rule))
    .reduce((sum, impact) => sum + impact.count, 0);

  log(
    options.json
      ? JSON.stringify({ total, linted: results.length, impacts }, null, 2)
      : renderImpact(impacts, total, results.length),
  );

  return { impacts, total };
}

interface ImpactStack {
  ESLint: EslintApi['ESLint'];
  tseslint: TsEslintApi | null;
  vueParser: Linter.Parser | null;
  stylistic: EslintNamespace.Plugin | undefined;
  imports: EslintNamespace.Plugin | undefined;
}

async function loadImpactStack(
  root: string,
  blueprint: Blueprint,
  ctx: { load: (name: string, root: string) => Promise<unknown>;
    framework: string; hasTypescript: boolean; },
): Promise<ImpactStack> {
  const { load, framework, hasTypescript } = ctx;
  const carriers = new Set(expectedCarriers(blueprint, hasTypescript).map((e) => e.carrier));

  return {
    ESLint: unwrapModule<EslintApi>(await loadStack(load, root, 'eslint')).ESLint,
    tseslint: hasTypescript
      ? unwrapModule<TsEslintApi>(await loadStack(load, root, 'typescript-eslint'))
      : null,
    vueParser: framework === 'vue'
      ? unwrapModule<Linter.Parser>(await loadStack(load, root, 'vue-eslint-parser'))
      : null,
    stylistic: carriers.has('stylistic')
      ? unwrapModule<EslintNamespace.Plugin>(
          await loadStack(load, root, '@stylistic/eslint-plugin'),
        )
      : undefined,
    imports: carriers.has('imports')
      ? unwrapModule<EslintNamespace.Plugin>(
          await loadStack(load, root, 'eslint-plugin-import-x'),
        )
      : undefined,
  };
}

function impactConfig(
  blueprint: Blueprint,
  framework: string,
  stack: ImpactStack,
): LintConfigEntry[] {
  const { tseslint, vueParser, stylistic, imports } = stack;

  const parserEntries: LintConfigEntry[] = [
    ...(vueParser
      ? [{
          files: ['**/*.vue'],
          languageOptions: {
            parser: vueParser,
            ...(tseslint ? { parserOptions: { parser: tseslint.parser } } : {}),
          },
        }]
      : []),
    ...(tseslint
      ? [{ files: ['**/*.{ts,tsx,mts,cts}'], languageOptions: { parser: tseslint.parser } }]
      : []),
    ...(framework === 'react'
      ? [{
          files: ['**/*.{js,jsx}'],
          languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
        }]
      : []),
  ];

  return [
    ...parserEntries,
    ...emitLint(blueprint, {
      ...(tseslint ? { typescript: tseslint.plugin } : {}),
      stylistic,
      imports,
    }),
  ];
}

function lintLayers(
  root: string,
  blueprint: Blueprint,
  run: { ESLint: EslintApi['ESLint']; config: LintConfigEntry[] },
): Promise<{ filePath: string; messages: { ruleId: string | null; fatal?: boolean }[] }[]> {
  const { architecture, framework } = blueprint;

  const globs = [
    ...new Set(
      architecture.layers.flatMap((layer) =>
        resolveLayerFiles(layer.name, framework, architecture),
      ),
    ),
  ];

  const eslint = new run.ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: run.config,

    errorOnUnmatchedPattern: false,
  });

  return eslint.lintFiles(globs);
}

function emittedRuleIds(config: LintConfigEntry[]): Set<string> {
  return new Set([
    ...config.flatMap((entry) => Object.keys(entry.rules ?? {})),
    ...SPECIAL_ROWS,
  ]);
}

function tallyImpacts(
  results: { filePath: string; messages: { ruleId: string | null; fatal?: boolean }[] }[],
  root: string,
  emitted: Set<string>,
): RuleImpact[] {
  const byRule = new Map<string, Map<string, number>>();

  for (const result of results) {
    const rel = path.relative(root, result.filePath).split(path.sep).join('/');

    for (const message of result.messages) {
      const rule = message.ruleId ?? (message.fatal ? 'parse-error' : 'unused-disable-directive');
      const perFile = byRule.get(rule) ?? new Map<string, number>();

      perFile.set(rel, (perFile.get(rel) ?? 0) + 1);
      byRule.set(rule, perFile);
    }
  }

  return [...byRule.entries()]
    .map(([rule, perFile]) => ({
      rule,
      count: [...perFile.values()].reduce((sum, n) => sum + n, 0),
      files: perFile.size,
      top: [...perFile.entries()]
        .map(([file, count]) => ({ path: file, count }))
        .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
        .slice(0, 5),
      foreign: !emitted.has(rule),
    }))
    .sort((a, b) => b.count - a.count || a.rule.localeCompare(b.rule));
}

const SPECIAL_ROWS = new Set(['parse-error', 'unused-disable-directive']);

export function renderImpact(impacts: RuleImpact[], total: number, linted: number): string {
  const own = impacts.filter((i) => !i.foreign && !SPECIAL_ROWS.has(i.rule));
  const caveats = impacts.filter((i) => SPECIAL_ROWS.has(i.rule));
  const foreign = impacts.filter((impact) => impact.foreign);

  const rows = (list: RuleImpact[]) =>
    list.flatMap((impact) => [
      `  ${String(impact.count).padStart(5)}  ${impact.rule} — ${impact.files} file(s)`,
      `         worst: ${impact.top.map((t) => `${t.path} (${t.count})`).join(', ')}`,
    ]);

  const caveatBlock = !caveats.length
    ? []
    : [
        '',
        'Isolation caveats — not wiring-introduced red, never counted above:',
        '(`unused-disable-directive`: the disable suppresses nothing HERE — one',
        'for a rule your real config turns ON vanishes after the merge, a truly',
        'stale one survives it; `parse-error`: the file could not be parsed and',
        'its numbers are untrustworthy. Verify both against your full lint.)',
        '',
        ...rows(caveats),
      ];

  const foreignBlock = !foreign.length
    ? []
    : [
        '',
        'Names YOUR OWN config owns — NOT blueprint findings, NEVER counted:',
        'this run configures the emitted rules and nothing else, so a row here',
        'is a name your CODE carries: an `eslint-disable` (or inline config)',
        'comment naming a house rule. ESLint reports the name it cannot resolve',
        'AT THAT COMMENT, so a count here counts mentions — not violations, and',
        'not a verdict on the code beneath one; a row beside a blueprint hit is',
        'not a second finding. The ROWS leave this report once emitLint merges',
        'into your real config. Your rule does not: defined again there, it',
        'judges that code itself, disable comments honored.',
        '',
        ...rows(foreign),
      ];

  if (!own.length) {
    return [

      linted === 0
        ? '✓ Rule impact: 0 hits — vacuous: the layer globs match no files, so no '
        + 'rule ever ran. Wiring emitLint introduces no red today, and proves '
        + 'nothing until code lands in a layer.'
        : '✓ Rule impact: 0 hits — wiring emitLint introduces no red today.',

      '  (scope: emitLint only — the anti-bypass guard is separate; the '
      + 'project\'s own lint judges its findings)',
      ...caveatBlock,
      ...foreignBlock,
    ].join('\n');
  }

  return [
    'Rule impact — what wiring emitLint would flag today',
    '',
    ...rows(own),
    '',
    `${total} hit(s). These numbers decide tiers, not just suppressions: a rule`
    + ' you would suppress everywhere is often better declared `warn` (or `off`)'
    + ' in the blueprint — its `rules` tier, or `emit.lint.severity` for the'
    + ' structural family. Judge each rule, then wire the config and lock only'
    + ' what remains with `npx eslint . --suppress-all` — new violations still fail.',
    ...caveatBlock,
    ...foreignBlock,
  ].join('\n');
}
