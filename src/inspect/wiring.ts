import path from 'node:path';

import type { Blueprint, RuleSetting } from '../config';
import { getForbiddenLayers, getModuleShape, getSelfOnlyTargets } from '../config';
// Import from the patterns leaf, not the emit/lint index — the index also
// exports lint.ts, which loads the plugin, which shares resolve logic with
// inspect; routing through the index would close a module cycle. The same
// primitives lint.ts compiles from build the expectations here, so the two
// sides cannot drift.
import {
  buildStructuralPatterns,
  deriveGlobalRules,
  resolveLayerFiles,
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
  const aliases = [architecture.alias, ...Object.keys(architecture.additionalAliases ?? {})];

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

/** First non-test, non-ignored source file inside a declared layer's globs. */
function pickProbe(
  scanResult: ScanResult,
  blueprint: Blueprint,
): { path: string; layer: string } | null {
  const { architecture, framework } = blueprint;
  const ignores = toArray(architecture.layerFilesIgnore ?? []).map(globToRegExp);

  const source = dropTestFiles(scanResult, architecture.testFiles).files.filter(
    (file) => !ignores.some((ignore) => ignore.test(file.path)),
  );

  for (const layer of architecture.layers) {
    const nets = resolveLayerFiles(
      layer.name,
      architecture.layerFiles,
      framework,
      architecture.sourceRoot,
    ).map(globToRegExp);

    const hit = source.find((file) => nets.some((net) => net.test(file.path)));

    if (hit) return { path: hit.path, layer: layer.name };
  }

  return null;
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

  const probe = pickProbe(scanResult, blueprint);

  if (!probe) return { label: `${LABEL} (skipped — no layer files yet)`, ok: true };

  let rules: Record<string, unknown>;

  try {
    const { ESLint } = unwrapModule<EslintApi>(await load('eslint', root));
    const eslint = new ESLint({ cwd: root });
    const resolved = await eslint.calculateConfigForFile(path.join(root, probe.path));

    rules = (resolved as { rules?: Record<string, unknown> })?.rules ?? {};
  } catch {
    // Unresolvable config = the project's own lint is broken or eslint is
    // not loadable here; that gate speaks for itself — doctor stays honest
    // by naming the skip, not by inventing a verdict.
    return { label: `${LABEL} (skipped — could not resolve the merged config)`, ok: true };
  }

  const expected = expectedStructural(blueprint, probe.layer);
  const resolved = resolvedStructural(rules);
  const lost: string[] = [];

  const missingGroups = [...expected.groups].filter((group) => !resolved.groups.has(group));
  const missingSelectors = [...expected.selectors].filter((s) => !resolved.selectors.has(s));
  const missingGlobals = [...expected.globals].filter((name) => !resolved.globals.has(name));

  if (missingGroups.length) {
    lost.push(`no-restricted-imports lost ${missingGroups.length} structural pattern group(s)`);
  }

  if (missingSelectors.length) {
    lost.push(`no-restricted-syntax lost ${missingSelectors.length} selfOnly selector(s)`);
  }

  if (missingGlobals.length) {
    lost.push(`no-restricted-globals lost ${missingGlobals.join(', ')}`);
  }

  if (!resolved.relativeEscape) {
    lost.push('blueprint/relative-escape is missing or off');
  }

  if (!lost.length) return { label: LABEL, ok: true };

  return {
    label: LABEL,
    ok: false,
    detail: `${lost.join('; ')} (checked against ${probe.path}) — a later flat-config entry `
      + 'replaced the rule, and flat config never merges: combine both option sets into ONE '
      + 'entry, then re-run doctor',
  };
}
