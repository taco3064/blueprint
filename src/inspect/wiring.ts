import path from 'node:path';

import { activeSetting,
  aliasLayerRoots,
  getForbiddenLayers,
  getModuleShape,
  getSelfOnlyTargets } from '../config';
import type { Blueprint } from '../config';
// The patterns leaf, not the emit/lint index: the index also exports lint.ts,
// whose plugin shares resolve logic with inspect, closing a module cycle.
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
 * Doctor's merge-survival check. Flat config never merges: a later entry
 * configuring the same rule silently REPLACES the earlier one, so lint stays green
 * while a structural ban disappears. This resolves the project's final config for
 * one real layer file and verifies the layer-boundary bans, selfOnly selectors,
 * globals and the embedded relative-escape rule. Package ownership is not verified.
 */

/**
 * What this check calls the config it resolved, and it is two different words: on
 * the path where init writes the live `eslint.config.mjs` there is no merge at all,
 * and a hardcoded "merged" sent a reader checking the wrong file (field run #148).
 */
const label = (merged: boolean): string =>
  `emitted rules survive the ${merged ? 'merged' : 'generated'} eslint config`;

/**
 * What a green on this check does and does NOT prove — an unqualified ✓ over a
 * half-verified merge is the false green this module exists to prevent (#40).
 *
 * It resolves ONE path per layer, so an entry that replaces blueprint's on PART of
 * a layer passes. Since #163 that partial-layer entry is the arrangement the
 * playbook recommends, so the blind spot now covers the intended shape, and the
 * playbook's remedy moved with it: two probes in the affected layer, not one.
 */
const SCOPE = 'structural bans + each active gate\'s carrier rule, one probe per layer; '
  + 'thresholds, package-ownership entries, and a merged entry scoped to only part of '
  + 'a layer are not compared';

/**
 * Gates whose ESLint rule exists only if the caller handed `emitLint` the carrier
 * plugin — a dropped one emits NOTHING while lint stays green. One representative
 * rule per gate: the carrier takes them all together, so a single id detects it.
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
 * Derive a concrete path satisfying `glob` — the synthetic probe for a layer with
 * no files yet. Star and brace shapes synthesize by construction; anything carrying
 * `?` or a character class yields no probe, never a wrong one.
 */
function syntheticPath(glob: string): string | null {
  if (/[?[\]]/.test(glob)) return null;

  return glob
    .replace(/\*\*\//g, '')
    .replace(/\{([^}]*)\}/g, (_, body: string) => body.split(',')[0])
    .replace(/\*+/g, '__blueprint_probe__');
}

/**
 * One probe per layer — a single probe would green-light an entry that swallows
 * some OTHER layer's rules, the exact scoping this check exists to catch. An empty
 * layer gets a synthetic probe, since `calculateConfigForFile` resolves by pattern
 * and never touches disk. Still a sample: one path stands in for the layer.
 */
function pickProbes(
  scanResult: ScanResult,
  blueprint: Blueprint,
): { path: string; layer: string }[] {
  const { architecture, framework } = blueprint;
  const ignores = toArray(architecture.layerFilesIgnore).map(globToRegExp);
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
  // Undecidable, and deliberately so: the option list is matched by shape, so a bogus
  // entry in the empty arm's place is ignored by every reader. Rejecting unrecognised
  // shapes loudly is the opposite of what this check promises — an entry it cannot
  // read belongs to the user, which is why it is counted and reported, never failed.
  return activeOptions(value)?.slice(1) ?? [];
}

/** A resolved rule's option list, or null when absent / severity off. */
function activeOptions(value: unknown): unknown[] | null {
  if (value == null) return null;

  const options = Array.isArray(value) ? value : [value];

  return options[0] === 0 || options[0] === 'off' ? null : options;
}

/**
 * Version-stable artifacts present in the *resolved* rule values, plus a count of
 * the entries this reader could not make sense of.
 *
 * The comparison downstream is by containment, so an unrecognised entry is the
 * user's business and never a loss — which made a hand-folded entry with a typo
 * look exactly like a deliberate one. The count makes that silence audible without
 * turning someone's own rule into a failure.
 */
function resolvedStructural(rules: Record<string, unknown>): {
  groups: Set<string>;
  selectors: Set<string>;
  globals: Set<string>;
  relativeEscape: boolean;
  unreadable: number;
} {
  const groups = new Set<string>();
  const selectors = new Set<string>();
  const globals = new Set<string>();

  // `optionsOf` answers [] for a rule that is absent or off — the same shape a rule
  // with a severity and no options has — so each loop below reads a list rather than
  // a maybe-list. The severity element is dropped there too, in one place instead of
  // three.
  let unreadable = 0;

  for (const option of optionsOf(rules['no-restricted-imports'])) {
    const patterns = (option as { patterns?: unknown[] })?.patterns;

    // A paths-only option carries no patterns at all — that is a shape, not a
    // mistake, so it is not counted.
    if (!Array.isArray(patterns)) continue;

    for (const pattern of patterns) {
      const group = (pattern as { group?: unknown })?.group;

      if (Array.isArray(group)) groups.add(JSON.stringify(group));
      else unreadable++;
    }
  }

  for (const item of optionsOf(rules['no-restricted-syntax'])) {
    const selector = typeof item === 'string' ? item : (item as { selector?: string })?.selector;

    if (selector) selectors.add(selector);
    else unreadable++;
  }

  for (const item of optionsOf(rules['no-restricted-globals'])) {
    const name = typeof item === 'string' ? item : (item as { name?: string })?.name;

    if (name) globals.add(name);
    else unreadable++;
  }

  return {
    groups,
    selectors,
    globals,
    relativeEscape: activeOptions(rules['blueprint/relative-escape']) !== null,
    unreadable,
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
  /**
   * True when the config it will resolve is a hand-maintained one the owner wired
   * the package into. False when it is init's own generated config, where nothing
   * was merged and the label must not say it was (field run #148).
   */
  merged: boolean;
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
  const { root, blueprint, scanResult, wired, merged, hasTypescript, load } = params;
  const LABEL = label(merged);

  if (!wired) {
    // Neither word fits this arm: nothing was merged, and there is no generated config
    // either — `merged` is `ownedEslintConfig === undefined`, which a repo with no eslint
    // config at all satisfies. So the one label that stays true says only "the eslint
    // config", or this path reproduces #148's confusion by the other route.
    return {
      label: 'emitted rules survive the eslint config (skipped — eslint not wired)',
      ok: true,
      skipped: 'eslint not wired — the wiring check above is the red for that',
    };
  }

  const probes = pickProbes(scanResult, blueprint);

  // No `skipped` on this one, deliberately, and the rule it follows is: mark a skip
  // when it hides something the rest of doctor does not already report. Here there is
  // no file in any layer, so there is nothing for the rules to protect and nothing to
  // verify — a state doctor already states outright as vacuous, "a green gate proves
  // nothing yet". Marking it too would relabel every greenfield scaffold as unverified
  // on the strength of a fact already on screen.
  if (!probes.length) {
    return { label: `${LABEL} (skipped — no probe derivable from the layer globs)`, ok: true };
  }

  const lost: string[] = [];
  const carriers = expectedCarriers(blueprint, hasTypescript);
  let unreadable = 0;

  try {
    const { ESLint } = unwrapModule<EslintApi>(await load('eslint', root));
    const eslint = new ESLint({ cwd: root });

    for (const probe of probes) {
      const config = await eslint.calculateConfigForFile(path.join(root, probe.path));
      const rules = (config as { rules?: Record<string, unknown> })?.rules ?? {};

      const resolved = resolvedStructural(rules);

      unreadable += resolved.unreadable;

      lost.push(...losses(expectedStructural(blueprint, probe.layer), resolved)
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
  } catch (error) {
    // An unresolvable config is a skip, not a verdict — but a skip the banner
    // counted as a pass is how an agent concluded the wiring was verified (#129).
    // The reason travels with it: a bare "would not resolve" sent three runs to
    // `npm run lint` to learn WHICH package was missing (field runs #145, #148, #149).
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);

    return {
      label: `${LABEL} (skipped — could not resolve the ${merged ? 'merged' : 'generated'} config)`,
      ok: true,
      skipped: `it would not resolve — "${reason}" — so nothing here proves the emitted rules are `
        + 'alive in it. A package named there that is missing from `package.json` too means '
        + 'init\'s install step never completed; re-run it, or the project\'s own lint, which '
        + 'fails for this same reason. This check runs once that passes',
    };
  }

  // Say what the ✓ covers. Unqualified, it reads as "every emitted rule is
  // alive", which this check has never been able to promise (field #40).
  if (!lost.length) {
    // Green, but not silent about what was skipped. An entry in a shape this check
    // cannot read is not a failure — containment means an unrecognised entry is the
    // user's own business — yet a hand-folded one with a typo looked identical to a
    // deliberate one, and the check said nothing either way.
    const note = unreadable === 0
      ? undefined
      : `${unreadable} restricted-import/syntax/globals entr${unreadable === 1 ? 'y' : 'ies'} `
        + 'in the resolved config could not be read by this check (not a blueprint entry, or '
        + 'a hand-folded one that drifted) — they are not compared, so a typo in one would '
        + 'not surface here';

    return { label: `${LABEL} (${SCOPE})`, ok: true, detail: note };
  }

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
      + 'version\'s output. The comparison is textual, not semantic: a selector or glob '
      + 'rewritten to an equivalent spelling (`\\/` for `/`, a reordered group) reads as '
      + 'missing here even though eslint would enforce it — copy the emitted text rather '
      + 'than retyping it. Fix that entry, then re-run doctor',
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
