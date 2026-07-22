import path from 'node:path';
import type { ESLint as EslintNamespace, Linter } from 'eslint';

import { emitLint, resolveLayerFiles } from '../emit/lint';
import type { LintConfigEntry } from '../emit/lint';
import { detect, loadProjectModule, resolveBlueprint, unwrapModule } from '../project';
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

// Deliberately NOT extending ResolveOptions: impact requires an authored
// config, and `framework` only steers the no-config preset fallback — a
// `--framework` here would be an inert flag that lies to whoever reads it.
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
   * True when the rule id is NOT part of the emitted config — an artifact of
   * linting in isolation (e.g. an existing `eslint-disable custom/x` comment
   * whose rule lives in the project's own config, absent here). Not counted
   * in the total: merging emitLint into the real config makes these vanish.
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
  const load = options.loadModule ?? loadProjectModule;

  const framework
    = blueprint.framework !== 'auto' ? blueprint.framework : state.framework ?? 'auto';

  const vue = framework === 'vue';
  const ts = state.hasTypescript;

  const { ESLint } = unwrapModule<EslintApi>(await loadStack(load, root, 'eslint'));

  const tseslint = ts
    ? unwrapModule<TsEslintApi>(await loadStack(load, root, 'typescript-eslint'))
    : null;

  const vueParser = vue
    ? unwrapModule<Linter.Parser>(await loadStack(load, root, 'vue-eslint-parser'))
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

  // The emitted rule ids, plus the two null-ruleId special rows — anything
  // else in the results is an isolation artifact, not a blueprint hit.
  const emitted = new Set([
    ...config.flatMap((entry) => Object.keys(entry.rules ?? {})),
    ...SPECIAL_ROWS,
  ]);

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
      foreign: !emitted.has(rule),
    }))
    .sort((a, b) => b.count - a.count || a.rule.localeCompare(b.rule));

  // The total answers exactly one question — how much red does the WIRING
  // introduce. Foreign rows vanish once emitLint merges into the real
  // config, and the two special rows are isolation caveats, not violations
  // (counting them under "would flag today" contradicted the caveat below
  // them — field batch 8 nearly locked three phantom findings).
  const total = impacts
    .filter((impact) => !impact.foreign && !SPECIAL_ROWS.has(impact.rule))
    .reduce((sum, impact) => sum + impact.count, 0);

  log(
    options.json
      ? JSON.stringify({ total, impacts }, null, 2)
      : renderImpact(impacts, total),
  );

  return { impacts, total };
}

/**
 * The two rows an isolated run produces that are not rule violations: a
 * parse failure, and a disable comment that suppresses nothing *here*.
 * Never counted in the total; rendered under their own caveat heading.
 */
const SPECIAL_ROWS = new Set(['parse-error', 'unused-disable-directive']);

/** The human-readable impact report. Caveats and foreign rows render apart. */
export function renderImpact(impacts: RuleImpact[], total: number): string {
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
        'pointing at your own config\'s rules vanishes after the merge, a truly',
        'stale one survives it; `parse-error`: the file could not be parsed and',
        'its numbers are untrustworthy. Verify both against your full lint.)',
        '',
        ...rows(caveats),
      ];

  const foreignBlock = !foreign.length
    ? []
    : [
        '',
        'Echoes of YOUR OWN config — NOT blueprint findings, NEVER counted:',
        'these rule ids are yours. They surface only because this run lints',
        'with the emitted config alone, and vanish once emitLint merges into',
        'your real config. A row mirroring a blueprint hit above is the same',
        'spot seen through your rule\'s name — an echo, not a second violation.',
        '',
        ...rows(foreign),
      ];

  if (!own.length) {
    return [
      '✓ Rule impact: 0 hits — wiring emitLint introduces no red today.',
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
