import path from 'node:path';
import type { ESLint as EslintNamespace, Linter } from 'eslint';

import { emitLint } from '../emit/lint';
import type { LintConfigEntry } from '../emit/lint';
import { expectedCarriers } from '../inspect';
import { resolveArchitecture } from '../config';
import type { Blueprint } from '../config';
import {
  detect,
  loadProjectModule,
  resolveBlueprint,
  SUPPORTED_ESLINT_MAJORS,
  unwrapModule,
} from '../project';
import type { ResolveOptions } from '../project';
import {
  renderImpactMissingConfig,
  renderImpactMissingDependency,
  renderImpactUnavailable,
  renderImpactReport,
} from '../operational-contract';
import type { OperationalText } from '../operational-contract';

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
  ESLint: {
    version?: string;
    new (options: object): {
      lintFiles: (patterns: string[]) => Promise<
        { filePath: string; messages: { ruleId: string | null; fatal?: boolean }[] }[]
      >;
    };
  };
}

export type ImpactResult
  = { status: 'available' | 'partial'; impacts: RuleImpact[]; total: number }
    | {
      status: 'unavailable';
      impacts: [];
      total: 0;
      reason: 'eslint-flat-api-unsupported';
      eslintMajor: number | null;
    };

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
      renderImpactMissingDependency(
        name,
        error instanceof Error ? error.message : String(error),
      ),
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
): Promise<ImpactResult> {
  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);

  if (!state.hasConfig) {
    throw new Error(renderImpactMissingConfig());
  }

  const { blueprint } = await resolveBlueprint(root, state, options);

  const framework
    = blueprint.framework !== 'auto' ? blueprint.framework : state.framework ?? 'auto';

  /* v8 ignore next -- the real project loader; tests inject the same boundary */
  const stack = await loadImpactStack(root, blueprint, {
    load: options.loadModule ?? loadProjectModule,
    framework,
    hasTypescript: state.hasTypescript,
  });

  return measureImpact({ root, blueprint, framework, stack, options, log });
}

async function measureImpact(input: {
  root: string;
  blueprint: Blueprint;
  framework: string;
  stack: ImpactStack;
  options: ImpactOptions;
  log: (message: string) => void;
}): Promise<ImpactResult> {
  const { root, blueprint, framework, stack, options, log } = input;
  const eslintMajor = majorVersion(stack.ESLint.version);

  if (eslintMajor !== null && !SUPPORTED_ESLINT_MAJORS.includes(eslintMajor)) {
    return unavailableImpact(eslintMajor, options, log);
  }

  const config = impactConfig(blueprint, framework, stack);
  let results: Awaited<ReturnType<typeof lintLayers>>;

  try {
    results = await lintLayers(root, blueprint, { ESLint: stack.ESLint, config });
  } catch (error) {
    if (!flatApiFailure(error)) {
      throw error;
    }

    return unavailableImpact(eslintMajor, options, log);
  }

  return reportImpact(
    tallyImpacts(results, root, emittedRuleIds(config)), results.length, { options, log },
  );
}

function reportImpact(
  impacts: RuleImpact[],
  linted: number,
  context: { options: ImpactOptions; log: (message: string) => void },
): ImpactResult {
  const { options, log } = context;

  const total = impacts
    .filter((impact) => !impact.foreign && !SPECIAL_ROWS.has(impact.rule))
    .reduce((sum, impact) => sum + impact.count, 0);

  const status = impacts.some((impact) => impact.rule === 'parse-error') ? 'partial' : 'available';

  log(
    options.json
      ? JSON.stringify({ status, total, linted, impacts }, null, 2)
      : renderImpact(impacts, total, linted),
  );

  return { status, impacts, total };
}

function unavailableImpact(
  eslintMajor: number | null,
  options: ImpactOptions,
  log: (message: string) => void,
): Extract<ImpactResult, { status: 'unavailable' }> {
  const result = {
    status: 'unavailable' as const,
    impacts: [] as [],
    total: 0 as const,
    reason: 'eslint-flat-api-unsupported' as const,
    eslintMajor,
  };

  log(options.json
    ? JSON.stringify(result, null, 2)
    : renderImpactUnavailable({ eslintMajor, supportedMajors: SUPPORTED_ESLINT_MAJORS }));

  return result;
}

function majorVersion(version: string | undefined): number | null {
  const major = version?.match(/^(\d+)\./)?.[1];

  return major === undefined ? null : Number(major);
}

function flatApiFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return /overrideConfigFile|useFlatConfig|FlatESLint/i.test(message);
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
            parserOptions: {
              ...(tseslint ? { parser: tseslint.parser } : {}),
              ecmaFeatures: { jsx: true },
            },
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
  const resolved = resolveArchitecture(architecture);

  const globs = [
    ...new Set(
      [
        ...resolved.containerFiles(framework),
        ...resolved.layers.flatMap((layer) => resolved.layerFiles(layer.name, framework)),
      ],
    ),
  ];

  if (!globs.length) {
    return Promise.resolve([]);
  }

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

export function renderImpact(
  impacts: RuleImpact[], total: number, linted: number,
): OperationalText {
  return renderImpactReport(
    impacts.map((impact) => ({
      ...impact,
      kind: impact.foreign
        ? 'foreign'
        : SPECIAL_ROWS.has(impact.rule) ? 'caveat' : 'own',
    })),
    total,
    linted,
  );
}
