import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ESLint as EslintNamespace, Linter } from 'eslint';

import { emitLint, resolveLayerFiles } from '../emit/lint';
import type { LintConfigEntry } from '../emit/lint';
import { detect, resolveBlueprint } from '../project';
import type { ResolveOptions } from '../project';

/**
 * `blueprint impact` — the rule-impact dry-run. Field feedback's costliest
 * authoring step was deciding rule conflicts before wiring: "how many times
 * would each emitted rule fire on this repo?" was answered by dumping the
 * emitLint output and reading it against the code by hand. This runtime
 * answers it directly: build the emitted config, run the *project's own*
 * ESLint over the layer files with only that config, and report hits per
 * rule. Informational, never a gate — the exit code stays 0.
 */

export interface ImpactOptions extends ResolveOptions {
  /** Emit machine-readable JSON instead of the text report. */
  json?: boolean;
  /** Output sink (default `console.log`). */
  log?: (message: string) => void;
  /** Load a module from the project's dependency tree (default: real import). */
  loadModule?: (name: string, root: string) => Promise<unknown>;
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
}

/* v8 ignore start -- real module resolution from the project; tests inject loadModule */
const defaultLoadModule = async (name: string, root: string): Promise<unknown> => {
  try {
    // Resolve from the project's own tree (pnpm keeps this package's tree
    // isolated, so a bare import from here would miss the project's deps).
    const require = createRequire(path.join(root, 'package.json'));

    return await import(pathToFileURL(require.resolve(name)).href);
  } catch {
    // ESM-only packages expose no `require` entry — fall back to a bare
    // import, resolved from this package's location inside the project tree.
    return import(name);
  }
};
/* v8 ignore stop */

/** Dynamic-import interop: CJS resolutions hang the exports off `default`. */
function unwrap<T>(module: unknown): T {
  const wrapped = module as { default?: T };

  return (wrapped.default ?? module) as T;
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
  } catch {
    // "Not installed" would over-claim: exotic layouts (pnpm isolation +
    // ESM-only entries) can defeat resolution for an installed package.
    throw new Error(
      `impact needs "${name}" from the project's dependencies and could not load it — `
      + 'is it installed? (blueprint init lists it among the required deps.)',
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
  const load = options.loadModule ?? defaultLoadModule;

  const framework
    = blueprint.framework !== 'auto' ? blueprint.framework : state.framework ?? 'auto';

  const vue = framework === 'vue';
  const ts = state.hasTypescript;

  const { ESLint } = unwrap<EslintApi>(await loadStack(load, root, 'eslint'));

  const tseslint = ts
    ? unwrap<TsEslintApi>(await loadStack(load, root, 'typescript-eslint'))
    : null;

  const vueParser = vue
    ? unwrap<Linter.Parser>(await loadStack(load, root, 'vue-eslint-parser'))
    : null;

  // The same parser wiring the generated eslint config carries (see
  // bootstrap's eslintConfigSource) — parsers only, so every file the
  // emitted rules cover can actually be parsed.
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
      ? [{ files: ['**/*.{js,jsx}'], languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } }]
      : []),
  ];

  const config = [
    ...parserEntries,
    ...emitLint(blueprint, tseslint ? { typescript: tseslint.plugin } : {}),
  ];

  const { architecture } = blueprint;

  const globs = [
    ...new Set(
      architecture.layers.flatMap((layer) =>
        resolveLayerFiles(layer.name, architecture.layerFiles, framework, architecture.sourceRoot),
      ),
    ),
  ];

  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: config,
    // Greenfield layers may hold no files yet — an empty net is a finding
    // for `inspect`'s coverage line, not a crash here.
    errorOnUnmatchedPattern: false,
  });

  const results = await eslint.lintFiles(globs);
  const byRule = new Map<string, Map<string, number>>();

  for (const result of results) {
    const rel = path.relative(root, result.filePath).split(path.sep).join('/');

    for (const message of result.messages) {
      // A null ruleId is two very different stories, split by `fatal`: a real
      // parse failure (that file's numbers cannot be trusted), or a stale
      // inline disable flagged by reportUnusedDisableDirectives (the file is
      // fine — the comment suppresses nothing). Both surface, never swallowed.
      const rule = message.ruleId ?? (message.fatal ? 'parse-error' : 'unused-disable-directive');
      const perFile = byRule.get(rule) ?? new Map<string, number>();

      perFile.set(rel, (perFile.get(rel) ?? 0) + 1);
      byRule.set(rule, perFile);
    }
  }

  const impacts: RuleImpact[] = [...byRule.entries()]
    .map(([rule, perFile]) => ({
      rule,
      count: [...perFile.values()].reduce((sum, n) => sum + n, 0),
      files: perFile.size,
      top: [...perFile.entries()]
        .map(([file, count]) => ({ path: file, count }))
        .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
        .slice(0, 5),
    }))
    .sort((a, b) => b.count - a.count || a.rule.localeCompare(b.rule));

  const total = impacts.reduce((sum, impact) => sum + impact.count, 0);

  log(
    options.json
      ? JSON.stringify({ total, impacts }, null, 2)
      : renderImpact(impacts, total),
  );

  return { impacts, total };
}

/** The human-readable impact report. */
export function renderImpact(impacts: RuleImpact[], total: number): string {
  if (!impacts.length) {
    return '✓ Rule impact: 0 hits — wiring emitLint introduces no red today.';
  }

  const lines = impacts.flatMap((impact) => [
    `  ${String(impact.count).padStart(5)}  ${impact.rule} — ${impact.files} file(s)`,
    `         worst: ${impact.top.map((t) => `${t.path} (${t.count})`).join(', ')}`,
  ]);

  return [
    'Rule impact — what wiring emitLint would flag today',
    '',
    ...lines,
    '',
    `${total} hit(s). Wire the config, then lock the existing debt with`
    + ' `npx eslint . --suppress-all` — new violations still fail.',
  ].join('\n');
}
