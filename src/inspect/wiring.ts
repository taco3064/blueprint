import path from 'node:path';

import { activeSetting,
  aliasLayerRoots,
  getForbiddenLayers,
  getModuleShape,
  getSelfOnlyTargets } from '../config';
import type { Blueprint } from '../config';
// Import from the patterns leaf, not the emit/lint index — the index also
// exports lint.ts, which loads the plugin, which shares resolve logic with
// inspect; routing through the index would close a module cycle. The same
// primitives lint.ts compiles from build the expectations here, so the two
// sides cannot drift.
import {
  buildStructuralPatterns,
  deriveGlobalRules,
  resolveLayerFiles,
  resolveTestFiles,
  selfOnlyReexportSelector,
  toArray,
} from '../emit/lint/patterns';
import { unwrapModule } from '../project';
import { dropTestFiles, globToRegExp } from './filter';
import type { DoctorCheck, ScanResult } from './types';

/**
 * Doctor's merge-survival check. Flat config never merges: when the user's
 * own entry configures the same rule as an emitLint entry, the later one
 * silently *replaces* the earlier — lint stays green while a structural ban
 * (or the user's own defense) disappears. Two field runs hit this from both
 * directions and caught it only by hand. This check resolves the project's
 * final config for one real layer file and verifies blueprint's structural
 * rules are still in it. Package-ownership entries are not yet verified —
 * only the layer-boundary bans, selfOnly selectors, globals, and the
 * embedded relative-escape rule.
 */

const LABEL = 'emitted rules survive the merged eslint config';

/**
 * What a green on this check does and does NOT prove. An unqualified ✓ over
 * a half-verified merge is the false green this whole module exists to
 * prevent: a field agent dropped the `stylistic` argument, watched lint pass
 * and doctor print this line, and only `eslint --print-config` showed the
 * ~68-rule codeStyle family had silently vanished (field issue #40).
 */
const SCOPE = 'structural bans + each active gate\'s carrier rule; thresholds and '
  + 'package-ownership entries are not compared';

/**
 * Gates whose ESLint rule exists only if the caller handed `emitLint` the
 * carrier plugin — the arguments the playbook warns hardest about, because a
 * dropped one emits NOTHING while lint stays green. One representative rule
 * per gate: losing the carrier loses all of them together, so a single id
 * detects it, and comparing one id (not values) keeps this version-stable
 * the way the structural side already is.
 */
const CARRIER_GATES = [
  { gate: 'codeStyle', rule: '@stylistic/max-len', carrier: 'stylistic' },
  { gate: 'statementsPerLine', rule: '@stylistic/max-statements-per-line', carrier: 'stylistic' },
  {
    gate: 'statementPadding',
    rule: '@stylistic/padding-line-between-statements',
    carrier: 'stylistic',
  },
  { gate: 'importBlock', rule: 'import-x/no-duplicates', carrier: 'imports' },
  // TypeScript-only, exactly as emitLint has it: `any` is a TS construct, so
  // a JS project legitimately resolves this gate to nothing.
  {
    gate: 'explicitAny',
    rule: '@typescript-eslint/no-explicit-any',
    carrier: 'typescript',
    typescriptOnly: true,
  },
] as const;

interface EslintApi {
  ESLint: new (options: object) => {
    calculateConfigForFile: (filePath: string) => Promise<unknown>;
  };
}

/** The tier check `emitLint` applies before emitting a rule. */

/**
 * The structural artifacts emitLint emits for `layer`, in version-stable
 * form: pattern groups (glob arrays), selfOnly selectors, restricted global
 * names. Messages and severities are deliberately excluded — the installed
 * blueprint may be a different version than the one doctor runs from.
 */
export function expectedStructural(
  blueprint: Blueprint,
  layer: string,
): { groups: Set<string>; selectors: Set<string>; globals: Set<string> } {
  const { architecture, rules } = blueprint;

  // The same offset-aware bases emitLint composes from — the expectations
  // and the emitted patterns cannot drift (field issue #29).
  const aliases = aliasLayerRoots(architecture)
    .map((root) => [root.alias, ...root.prefix].join('/'));

  const layouts = Object.fromEntries(
    architecture.layers.map((entry) => [
      entry.name,
      getModuleShape(architecture, entry.name).layout,
    ]),
  );

  const forbidden = getForbiddenLayers(architecture, layer);

  const structural = buildStructuralPatterns({
    layer,
    aliases,
    forbidden,
    moduleLayout: layouts[layer],
    folderTargets: architecture.layers
      .map((entry) => entry.name)
      .filter((name) => layouts[name] === 'folder' && name !== layer && !forbidden.includes(name)),
    fixtures: activeSetting(rules?.fixtureImports)
      ? aliases.flatMap((alias) => [`${alias}/fixtures`, `${alias}/fixtures/**`])
      : [],
  });

  return {
    groups: new Set(structural.map((pattern) => JSON.stringify(pattern.group))),
    selectors: new Set(
      getSelfOnlyTargets(architecture, layer).flatMap((target) =>
        aliases.map((alias) => selfOnlyReexportSelector(alias, target)),
      ),
    ),
    globals: new Set(
      deriveGlobalRules(architecture.layers)
        .filter((rule) => !rule.allowedIn.includes(layer))
        .map((rule) => rule.global),
    ),
  };
}

/**
 * Derive a concrete path that satisfies `glob` — the synthetic probe for a
 * layer that holds no files yet. Star and brace shapes synthesize by
 * construction (a `**` prefix collapses, the first brace alternative is
 * taken, remaining stars become the probe name — each substitution matches
 * its own pattern); anything carrying `?` or a character class is not
 * synthesized at all, so an unusual glob yields no probe, never a wrong one.
 */
function syntheticPath(glob: string): string | null {
  if (/[?[\]]/.test(glob)) return null;

  return glob
    .replace(/\*\*\//g, '')
    .replace(/\{([^}]*)\}/g, (_, body: string) => body.split(',')[0])
    .replace(/\*+/g, '__blueprint_probe__');
}

/**
 * One probe per layer — a single probe would green-light a user entry that
 * swallows the rules of some *other* layer (`files: ['src/services/**']`),
 * the exact scoping the check exists to catch. A layer with no files yet
 * gets a *synthetic* probe: `calculateConfigForFile` resolves by pattern
 * and never touches the filesystem, so the anti-false-green check need not
 * go blind on the empty repos that most need it (field batch 7). Still a
 * sample, not a proof: within a layer, one path stands in for all of them.
 */
function pickProbes(
  scanResult: ScanResult,
  blueprint: Blueprint,
): { path: string; layer: string }[] {
  const { architecture, framework } = blueprint;
  const ignores = toArray(architecture.layerFilesIgnore ?? []).map(globToRegExp);
  const tests = resolveTestFiles(architecture.testFiles).map(globToRegExp);

  const source = dropTestFiles(scanResult, architecture.testFiles).files.filter(
    (file) => !ignores.some((ignore) => ignore.test(file.path)),
  );

  return architecture.layers.flatMap((layer) => {
    const globs = resolveLayerFiles(
      layer.name,
      architecture.layerFiles,
      framework,
      architecture.sourceRoot,
    );

    const nets = globs.map(globToRegExp);
    const hit = source.find((file) => nets.some((net) => net.test(file.path)));

    if (hit) return [{ path: hit.path, layer: layer.name }];

    // The synthetic candidate must sit exactly where a real file would:
    // inside the net, outside the ignores, and never shaped like a test
    // file (the emitted entries exempt those, so expectations would lie).
    const synthetic = globs
      .map(syntheticPath)
      .find(
        (candidate): candidate is string =>
          candidate !== null
          && !ignores.some((ignore) => ignore.test(candidate))
          && !tests.some((test) => test.test(candidate)),
      );

    return synthetic ? [{ path: synthetic, layer: layer.name }] : [];
  });
}

/**
 * A resolved rule's options WITHOUT its severity — [] when the rule is absent or
 * off. The severity lives at index 0 of an eslint rule entry and is never an
 * option, so every reader dropped it separately; doing it here means a reader
 * cannot forget, and cannot disagree about what "no options" looks like.
 */
function optionsOf(value: unknown): unknown[] {
  return activeOptions(value)?.slice(1) ?? [];
}

/** A resolved rule's option list, or null when absent / severity off. */
function activeOptions(value: unknown): unknown[] | null {
  if (value == null) return null;

  const options = Array.isArray(value) ? value : [value];

  return options[0] === 0 || options[0] === 'off' ? null : options;
}

/** Version-stable artifacts present in the *resolved* rule values. */
function resolvedStructural(rules: Record<string, unknown>): {
  groups: Set<string>;
  selectors: Set<string>;
  globals: Set<string>;
  relativeEscape: boolean;
} {
  const groups = new Set<string>();
  const selectors = new Set<string>();
  const globals = new Set<string>();

  // `optionsOf` answers [] for a rule that is absent or off — the same shape a rule
  // with a severity and no options has — so each loop below reads a list rather than
  // a maybe-list. The severity element is dropped there too, in one place instead of
  // three.
  for (const option of optionsOf(rules['no-restricted-imports'])) {
    const patterns = (option as { patterns?: unknown[] })?.patterns;

    if (!Array.isArray(patterns)) continue;

    for (const pattern of patterns) {
      const group = (pattern as { group?: unknown })?.group;

      if (Array.isArray(group)) groups.add(JSON.stringify(group));
    }
  }

  for (const item of optionsOf(rules['no-restricted-syntax'])) {
    const selector = typeof item === 'string' ? item : (item as { selector?: string })?.selector;

    if (selector) selectors.add(selector);
  }

  for (const item of optionsOf(rules['no-restricted-globals'])) {
    const name = typeof item === 'string' ? item : (item as { name?: string })?.name;

    if (name) globals.add(name);
  }

  return {
    groups,
    selectors,
    globals,
    relativeEscape: activeOptions(rules['blueprint/relative-escape']) !== null,
  };
}

/**
 * The carrier-backed gates this blueprint actually expects to resolve — the
 * gate must be on, and its carrier must be one the stack can supply.
 */
export function expectedCarriers(
  blueprint: Blueprint,
  hasTypescript: boolean,
): { gate: string; rule: string; carrier: string }[] {
  return CARRIER_GATES.filter(
    (entry) =>
      activeSetting(blueprint.rules?.[entry.gate]) !== null
      && (!('typescriptOnly' in entry) || hasTypescript),
  );
}

export interface WiringParams {
  root: string;
  blueprint: Blueprint;
  scanResult: ScanResult;
  /** detect's verdict — when eslint is not wired at all, this check skips. */
  wired: boolean;
  /** Gates the stack cannot carry are not expected — `explicitAny` on JS. */
  hasTypescript: boolean;
  load: (name: string, root: string) => Promise<unknown>;
}

/**
 * Run the merge-survival check. Every unreachable precondition skips with a
 * labeled reason instead of failing — a red nobody can appease is worse
 * than no check; the "eslint wired" check and the project's own lint run
 * cover those states already.
 */
export async function wiringCheck(params: WiringParams): Promise<DoctorCheck> {
  const { root, blueprint, scanResult, wired, hasTypescript, load } = params;

  if (!wired) return { label: `${LABEL} (skipped — eslint not wired)`, ok: true };

  const probes = pickProbes(scanResult, blueprint);

  if (!probes.length) {
    return { label: `${LABEL} (skipped — no probe derivable from the layer globs)`, ok: true };
  }

  const lost: string[] = [];
  const carriers = expectedCarriers(blueprint, hasTypescript);

  try {
    const { ESLint } = unwrapModule<EslintApi>(await load('eslint', root));
    const eslint = new ESLint({ cwd: root });

    for (const probe of probes) {
      const config = await eslint.calculateConfigForFile(path.join(root, probe.path));
      const rules = (config as { rules?: Record<string, unknown> })?.rules ?? {};

      lost.push(...losses(expectedStructural(blueprint, probe.layer), resolvedStructural(rules))
        .map((loss) => `${probe.layer}: ${loss}`));

      // A gate declared in blueprint.config.mjs whose rule is absent from the
      // resolved config means the merge dropped its carrier — the silent
      // failure the playbook spends the most words on, and the one this
      // check used to walk straight past.
      lost.push(
        ...carriers
          .filter((entry) => activeOptions(rules[entry.rule]) === null)
          .map(
            (entry) =>
              `${probe.layer}: rules.${entry.gate} is on but ${entry.rule} resolved to nothing `
              + `— emitLint's \`${entry.carrier}\` argument is missing from the merged entry`,
          ),
      );
    }
  } catch {
    // Unresolvable config = the project's own lint is broken or eslint is
    // not loadable here; that gate speaks for itself — doctor stays honest
    // by naming the skip, not by inventing a verdict.
    return { label: `${LABEL} (skipped — could not resolve the merged config)`, ok: true };
  }

  // Say what the ✓ covers. Unqualified, it reads as "every emitted rule is
  // alive", which this check has never been able to promise (field #40).
  if (!lost.length) return { label: `${LABEL} (${SCOPE})`, ok: true };

  // The check compares exact emitted text, so a red has TWO possible causes
  // — naming only the replace cause sent a field agent chasing a merge
  // collision that did not exist (field issue #19).
  return {
    label: LABEL,
    ok: false,
    detail: `${lost.join('; ')} — the resolved config no longer carries the exact text this `
      + 'version emits. Either a later flat-config entry replaced the rule (flat config '
      + 'never merges: combine both option sets into ONE entry — `blueprint rules --json` '
      + 'carries the exact selfOnly selectors), or a hand-folded copy drifted from this '
      + 'version\'s output. Fix that entry, then re-run doctor',
  };
}

/** What the merge dropped, per artifact family. */
function losses(
  expected: ReturnType<typeof expectedStructural>,
  resolved: ReturnType<typeof resolvedStructural>,
): string[] {
  const lost: string[] = [];

  const groups = [...expected.groups].filter((group) => !resolved.groups.has(group));
  const selectors = [...expected.selectors].filter((s) => !resolved.selectors.has(s));
  const globals = [...expected.globals].filter((name) => !resolved.globals.has(name));

  if (groups.length) {
    lost.push(`no-restricted-imports lost ${groups.length} structural pattern group(s)`);
  }

  if (selectors.length) {
    lost.push(`no-restricted-syntax lost ${selectors.length} selfOnly selector(s)`);
  }

  if (globals.length) {
    lost.push(`no-restricted-globals lost ${globals.join(', ')}`);
  }

  if (!resolved.relativeEscape) {
    lost.push('blueprint/relative-escape is missing or off');
  }

  return lost;
}
