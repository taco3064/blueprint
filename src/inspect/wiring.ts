import path from 'node:path';

import { activeSetting } from '../config';
import type { Blueprint } from '../config';
// The patterns / bans / nets leaves, not the emit/lint index: the index also
// exports lint.ts, whose plugin shares resolve logic with inspect, closing a
// module cycle. `bans.ts` is the same resolver `emitLint` itself compiles the
// emitted patterns from — the expectations below and the real output are the
// same function call, not two hand-rolled ones that happen to agree today.
import {
  barredIn,
  netModuleSelfOnly,
  netPatterns,
  netSelfOnly,
  resolveBanScope,
} from '../emit/lint/bans';
import { netLabel, resolveFileNets } from '../emit/lint/nets';
import type { NetScope } from '../emit/lint/nets';
import {
  resolveTestFiles,
  selfOnlyModuleReexportSelector,
  selfOnlyReexportSelector,
  toArray,
} from '../emit/lint/patterns';
import { unwrapModule } from '../project';
import { dropTestFiles, fileGlobMatches, ignoresFile } from './filter';
import type { DoctorCheck, ScanResult } from './types';

/**
 * Doctor's merge-survival check. Flat config never merges: a later entry
 * configuring the same rule silently REPLACES the earlier one, so lint stays green
 * while a structural ban disappears. This resolves the project's final config for
 * one real file per governed net — a layer, or (under a modular blueprint) a
 * module's own root files, or a layer nested inside a module — and verifies the
 * structural bans, selfOnly selectors, globals and the embedded relative-escape
 * rule. Package ownership is not verified.
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
 * It resolves ONE path per governed net, so an entry that replaces blueprint's on
 * PART of a net passes. Since #163 that partial-layer entry is the arrangement the
 * playbook recommends, so the blind spot now covers the intended shape, and the
 * playbook's remedy moved with it: two probes in the affected net, not one.
 */
const SCOPE = 'structural bans + each active gate\'s carrier rule, one probe per governed '
  + 'net (a layer, or under a modular blueprint a module\'s own root files, or a layer '
  + 'nested inside a module); thresholds, package-ownership entries, and a merged entry '
  + 'scoped to only part of a net are not compared';

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
 * The structural artifacts emitLint emits for `net`, in version-stable form:
 * pattern groups (glob arrays), selfOnly selectors, restricted global names.
 * Messages and severities are deliberately excluded — the installed
 * blueprint may be a different version than the one doctor runs from.
 *
 * Built from the same `bans.ts` primitives `emitLint` itself compiles from —
 * `resolveBanScope` resolves the whole blueprint's ban facts once, and
 * `netPatterns` / `netSelfOnly` / `netModuleSelfOnly` / `barredIn` cut one
 * net's structural artifacts from them, layer flow AND (inside a module)
 * module flow together. The expectation and the emitted patterns are the
 * same function call, not two hand-rolled ones that happen to agree today
 * (field issue #29's failure mode, one level up).
 */
export function expectedStructural(
  blueprint: Blueprint,
  net: NetScope,
): { groups: Set<string>; selectors: Set<string>; globals: Set<string> } {
  const { architecture } = blueprint;
  const scope = resolveBanScope(blueprint);

  const selectors = [
    ...netSelfOnly(net, architecture).flatMap(({ path }) =>
      scope.aliases.map((alias) => selfOnlyReexportSelector(alias, path))),
    // A module's own bare entry IS its re-exportable spelling, so its
    // selfOnly ban needs the selector that also matches that exact form —
    // see `selfOnlyModuleReexportSelector`'s own doc comment.
    ...netModuleSelfOnly(net, architecture).flatMap(({ path }) =>
      scope.aliases.map((alias) => selfOnlyModuleReexportSelector(alias, path))),
  ];

  return {
    groups: new Set(netPatterns(net, scope).map((pattern) => JSON.stringify(pattern.group))),
    selectors: new Set(selectors),
    globals: new Set(
      scope.globalRules.filter((rule) => barredIn(net, rule)).map((rule) => rule.global),
    ),
  };
}

/**
 * Derive a concrete path satisfying `glob` — the synthetic probe for a layer with
 * no files yet. Star and brace shapes synthesize by construction; anything carrying
 * `?` or a character class yields no probe, never a wrong one.
 */
function syntheticPath(glob: string): string | null {
  if (/[?[\]]/.test(glob)) {
    return null;
  }

  return glob
    .replace(/\*\*\//g, '')
    .replace(/\{([^}]*)\}/g, (_, body: string) => body.split(',')[0])
    .replace(/\*+/g, '__blueprint_probe__');
}

/**
 * One probe per governed net — `resolveFileNets`, the same resolver `emitLint`
 * itself compiles the config from. Flat, that is unchanged: one net per layer.
 * Modular, it is one net per module's own root files plus one per layer nested
 * inside each module — the exact groups `emitLint` governs, so a merge that
 * silently drops a module-scoped ban has somewhere to be caught; iterating
 * `architecture.layers` alone (as this used to) builds probes like
 * `resolveLayerFiles('hooks', ...)`, which no real file under a module ever
 * matches (`src/Combat/hooks/**`), so a modular repo's module-axis bans went
 * unprobed entirely.
 *
 * A single probe would green-light an entry that swallows some OTHER net's
 * rules, the exact scoping this check exists to catch. An empty net gets a
 * synthetic probe, since `calculateConfigForFile` resolves by pattern and
 * never touches disk. Still a sample: one path stands in for the whole net.
 */
function pickProbes(
  scanResult: ScanResult,
  blueprint: Blueprint,
): { path: string; net: NetScope }[] {
  const { architecture, framework } = blueprint;
  // The test globs ARE a net entry's own `ignores`, and `ignoresFile` is how
  // ESLint reads one: an ordered list, not a test per entry. `layerFilesIgnore`
  // is the other shape — global ignores, an entry with no `files` — which ESLint
  // decides by a parent-directory walk first, where an ignored directory's
  // descendants can no longer be re-included. Measured: `['gen', '!gen/keep.ts']`
  // ignores every file under `gen/` as global ignores and none of them as an
  // entry's. Probe picking reads the file half alone, as it always has; that gap
  // can only leave a candidate in, never take one out.
  const ignores = toArray(architecture.layerFilesIgnore);
  const tests = resolveTestFiles(architecture.testFiles);

  const source = dropTestFiles(scanResult, architecture.testFiles).files.filter(
    (file) => !ignoresFile(ignores, file.path),
  );

  return resolveFileNets(architecture, framework).flatMap((net) => {
    const hit = source.find((file) => net.files.some((glob) => fileGlobMatches(glob, file.path)));

    if (hit) {
      return [{ path: hit.path, net }];
    }

    // The synthetic candidate must sit exactly where a real file would:
    // inside the net, outside the ignores, and never shaped like a test
    // file (the emitted entries exempt those, so expectations would lie).
    const synthetic = net.files
      .map(syntheticPath)
      .find(
        (candidate): candidate is string =>
          candidate !== null
          && !ignoresFile(ignores, candidate)
          && !ignoresFile(tests, candidate),
      );

    return synthetic ? [{ path: synthetic, net }] : [];
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
  if (value == null) {
    return null;
  }

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
  const imports = readPatternGroups(rules['no-restricted-imports']);
  const selectors = readNamed(rules['no-restricted-syntax'], 'selector');
  const globals = readNamed(rules['no-restricted-globals'], 'name');

  return {
    groups: imports.values,
    selectors: selectors.values,
    globals: globals.values,
    relativeEscape: activeOptions(rules['blueprint/relative-escape']) !== null,
    unreadable: imports.unreadable + selectors.unreadable + globals.unreadable,
  };
}

/** What one restricted-* rule resolved to, and how much of it this check could not read. */
interface ReadEntries {
  values: Set<string>;
  unreadable: number;
}

/**
 * `optionsOf` answers [] for a rule that is absent or off — the same shape a rule
 * with a severity and no options has — so each reader below takes a list rather than
 * a maybe-list, and the severity element is dropped there in one place.
 */
function readPatternGroups(entry: unknown): ReadEntries {
  const values = new Set<string>();
  let unreadable = 0;

  for (const option of optionsOf(entry)) {
    const patterns = (option as { patterns?: unknown[] })?.patterns;

    // A paths-only option carries no patterns at all — that is a shape, not a
    // mistake, so it is not counted.
    if (!Array.isArray(patterns)) {
      continue;
    }

    for (const pattern of patterns) {
      const group = (pattern as { group?: unknown })?.group;

      if (Array.isArray(group)) {
        values.add(JSON.stringify(group));
      } else {
        unreadable++;
      }
    }
  }

  return { values, unreadable };
}

/** `no-restricted-syntax` / `-globals`: each entry is a bare string or an object. */
function readNamed(entry: unknown, key: 'selector' | 'name'): ReadEntries {
  const values = new Set<string>();
  let unreadable = 0;

  for (const item of optionsOf(entry)) {
    const value = typeof item === 'string' ? item : (item as Record<string, string>)?.[key];

    if (value) {
      values.add(value);
    } else {
      unreadable++;
    }
  }

  return { values, unreadable };
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
  const { blueprint, scanResult, wired, merged } = params;
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

  let survey: { lost: string[]; unreadable: number };

  try {
    survey = await surveyProbes(params, probes);
  } catch (error) {
    return unresolvableConfig(LABEL, merged, error);
  }

  if (!survey.lost.length) {
    return surviving(LABEL, survey.unreadable);
  }

  // The check compares exact emitted text, so a red has TWO possible causes
  // — naming only the replace cause sent a field agent chasing a merge
  // collision that did not exist (field issue #19).
  return {
    label: LABEL,
    ok: false,
    detail: `${survey.lost.join('; ')} — the resolved config no longer carries the exact text this `
      + 'version emits. Either a later flat-config entry replaced the rule (flat config '
      + 'never merges: combine both option sets into ONE entry — `blueprint rules --json` '
      + 'carries the exact selfOnly selectors), or a hand-folded copy drifted from this '
      + 'version\'s output. The comparison is textual, not semantic: a selector or glob '
      + 'rewritten to an equivalent spelling (`\\/` for `/`, a reordered group) reads as '
      + 'missing here even though eslint would enforce it — copy the emitted text rather '
      + 'than retyping it. Fix that entry, then re-run doctor',
  };
}

/** Resolve the real config for each probe file and collect what it no longer carries. */
async function surveyProbes(
  params: WiringParams,
  probes: ReturnType<typeof pickProbes>,
): Promise<{ lost: string[]; unreadable: number }> {
  const { root, blueprint, hasTypescript, load } = params;
  const carriers = expectedCarriers(blueprint, hasTypescript);
  const lost: string[] = [];
  let unreadable = 0;

  const { ESLint } = unwrapModule<EslintApi>(await load('eslint', root));
  const eslint = new ESLint({ cwd: root });

  for (const probe of probes) {
    const config = await eslint.calculateConfigForFile(path.join(root, probe.path));
    const rules = (config as { rules?: Record<string, unknown> })?.rules ?? {};
    const resolved = resolvedStructural(rules);

    unreadable += resolved.unreadable;

    const label = netLabel(probe.net);

    lost.push(...losses(expectedStructural(blueprint, probe.net), resolved)
      .map((loss) => `${label}: ${loss}`));

    // A gate declared in blueprint.config.mjs whose rule is absent from the
    // resolved config means the merge dropped its carrier — the silent
    // failure the playbook spends the most words on, and the one this
    // check used to walk straight past.
    lost.push(
      ...carriers
        .filter((entry) => activeOptions(rules[entry.rule]) === null)
        .map(
          (entry) =>
            `${label}: rules.${entry.gate} is on but ${entry.rule} resolved to nothing `
            + `— emitLint's \`${entry.carrier}\` argument is missing from the merged entry`,
        ),
    );
  }

  return { lost, unreadable };
}

/**
 * An unresolvable config is a skip, not a verdict — but a skip the banner counted as
 * a pass is how an agent concluded the wiring was verified (#129). The reason travels
 * with it: a bare "would not resolve" sent three runs to `npm run lint` to learn WHICH
 * package was missing (field runs #145, #148, #149).
 */
function unresolvableConfig(label: string, merged: boolean, error: unknown): DoctorCheck {
  const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);

  return {
    label: `${label} (skipped — could not resolve the ${merged ? 'merged' : 'generated'} config)`,
    ok: true,
    skipped: `it would not resolve — "${reason}" — so nothing here proves the emitted rules are `
      + 'alive in it. A package named there that is missing from `package.json` too means '
      + 'init\'s install step never completed; re-run it, or the project\'s own lint, which '
      + 'fails for this same reason. This check runs once that passes',
  };
}

/**
 * Say what the ✓ covers. Unqualified, it reads as "every emitted rule is alive",
 * which this check has never been able to promise (field #40) — and an entry in a
 * shape it cannot read is not a failure, yet a hand-folded one with a typo looked
 * identical to a deliberate one while the check said nothing either way.
 */
function surviving(label: string, unreadable: number): DoctorCheck {
  const note = unreadable === 0
    ? undefined
    : `${unreadable} restricted-import/syntax/globals entr${unreadable === 1 ? 'y' : 'ies'} `
      + 'in the resolved config could not be read by this check (not a blueprint entry, or '
      + 'a hand-folded one that drifted) — they are not compared, so a typo in one would '
      + 'not surface here';

  return { label: `${label} (${SCOPE})`, ok: true, detail: note };
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
