import path from 'node:path';

import type { Blueprint, RuleSetting } from '../config';
import {
  aliasLayerRoots,
  getForbiddenLayers,
  getModuleShape,
  getSelfOnlyTargets,
} from '../config';
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

interface EslintApi {
  ESLint: new (options: object) => {
    calculateConfigForFile: (filePath: string) => Promise<unknown>;
  };
}

/** The tier check `emitLint` applies before emitting a rule. */
function active(setting: RuleSetting | undefined): boolean {
  const tier = typeof setting === 'string' ? setting : setting?.tier;

  return tier !== undefined && tier !== 'off';
}

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
    fixtures: active(rules?.fixtureImports)
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

  for (const option of activeOptions(rules['no-restricted-imports'])?.slice(1) ?? []) {
    const patterns = (option as { patterns?: unknown[] })?.patterns;

    if (!Array.isArray(patterns)) continue;

    for (const pattern of patterns) {
      const group = (pattern as { group?: unknown })?.group;

      if (Array.isArray(group)) groups.add(JSON.stringify(group));
    }
  }

  for (const item of activeOptions(rules['no-restricted-syntax'])?.slice(1) ?? []) {
    const selector = typeof item === 'string' ? item : (item as { selector?: string })?.selector;

    if (selector) selectors.add(selector);
  }

  for (const item of activeOptions(rules['no-restricted-globals'])?.slice(1) ?? []) {
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

export interface WiringParams {
  root: string;
  blueprint: Blueprint;
  scanResult: ScanResult;
  /** detect's verdict — when eslint is not wired at all, this check skips. */
  wired: boolean;
  load: (name: string, root: string) => Promise<unknown>;
}

/**
 * Run the merge-survival check. Every unreachable precondition skips with a
 * labeled reason instead of failing — a red nobody can appease is worse
 * than no check; the "eslint wired" check and the project's own lint run
 * cover those states already.
 */
export async function wiringCheck(params: WiringParams): Promise<DoctorCheck> {
  const { root, blueprint, scanResult, wired, load } = params;

  if (!wired) return { label: `${LABEL} (skipped — eslint not wired)`, ok: true };

  const probes = pickProbes(scanResult, blueprint);

  if (!probes.length) {
    return { label: `${LABEL} (skipped — no probe derivable from the layer globs)`, ok: true };
  }

  const lost: string[] = [];

  try {
    const { ESLint } = unwrapModule<EslintApi>(await load('eslint', root));
    const eslint = new ESLint({ cwd: root });

    for (const probe of probes) {
      const config = await eslint.calculateConfigForFile(path.join(root, probe.path));
      const rules = (config as { rules?: Record<string, unknown> })?.rules ?? {};

      lost.push(...losses(expectedStructural(blueprint, probe.layer), resolvedStructural(rules))
        .map((loss) => `${probe.layer}: ${loss}`));
    }
  } catch {
    // Unresolvable config = the project's own lint is broken or eslint is
    // not loadable here; that gate speaks for itself — doctor stays honest
    // by naming the skip, not by inventing a verdict.
    return { label: `${LABEL} (skipped — could not resolve the merged config)`, ok: true };
  }

  if (!lost.length) return { label: LABEL, ok: true };

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
