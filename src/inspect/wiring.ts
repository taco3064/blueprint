import path from 'node:path';

import { activeSetting, resolveArchitecture, resolveTestFiles } from '../config';
import type { Blueprint } from '../config';

import { toArray } from '../emit/lint/patterns';
import { unwrapModule } from '../project';
import { dropTestFiles, globToRegExp } from './filter';
import type { DoctorCheck, ScanResult } from './types';
import { expectedContainerStructural, expectedStructural } from './wiring-expected';

export { expectedContainerStructural, expectedStructural } from './wiring-expected';

const label = (merged: boolean): string =>
  `emitted rules survive the ${merged ? 'merged' : 'generated'} eslint config`;

const SCOPE = 'structural bans + canonical/dynamic policy + each active gate\'s carrier rule, '
  + 'one probe per governed position; '
  + 'thresholds, package-ownership entries, and a merged entry scoped to only part of '
  + 'a governed position are not compared';

const CARRIER_GATES = [
  { gate: 'codeStyle', rule: '@stylistic/max-len', carrier: 'stylistic' },
  { gate: 'statementsPerLine', rule: '@stylistic/max-statements-per-line', carrier: 'stylistic' },
  {
    gate: 'statementPadding',
    rule: '@stylistic/padding-line-between-statements',
    carrier: 'stylistic',
  },
  { gate: 'importBlock', rule: 'import-x/no-duplicates', carrier: 'imports' },

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

type ProbeSite = { layer: string | null; module?: string; globs: string[]; hit: string | null };

function syntheticPath(glob: string): string | null {
  if (/[?[\]]/.test(glob)) {
    return null;
  }

  return glob
    .replace(/\*\*\//g, '')
    .replace(/\{([^}]*)\}/g, (_, body: string) => body.split(',')[0])
    .replace(/\*+/g, '__blueprint_probe__');
}

function syntheticCandidates(globs: string[]): string[] {
  return globs
    .map(syntheticPath)
    .filter((candidate): candidate is string => candidate !== null);
}

function layerProbeSites(
  blueprint: Blueprint,
  scanResult: ScanResult,
  ignores: string[],
): ProbeSite[] {
  const { architecture, framework } = blueprint;
  const held = ignores.map(globToRegExp);

  const source = dropTestFiles(scanResult, architecture.testFiles).files.filter(
    (file) => !held.some((ignore) => ignore.test(file.path)),
  );

  return resolveArchitecture(architecture).layerPositions.map((position) => {
    const layer = position.layer.definition;
    const module = position.module?.name;
    const globs = resolveArchitecture(architecture).layerFiles(layer.name, framework, module);
    const nets = globs.map(globToRegExp);

    return {
      layer: layer.name,
      ...(module ? { module } : {}),
      globs,
      hit: source.find((file) => nets.some((net) => net.test(file.path)))?.path ?? null,
    };
  });
}

function containerProbeSites(
  blueprint: Blueprint,
  scanResult: ScanResult,
  ignores: string[],
): ProbeSite[] {
  const { architecture, framework } = blueprint;
  const resolved = resolveArchitecture(architecture);

  // Stryker disable next-line BlockStatement, ConditionalExpression: layer-first has no modules.
  if (resolved.topology !== 'module-first') {
    return [];
  }

  const held = ignores.map(globToRegExp);

  const source = dropTestFiles(scanResult, architecture.testFiles).files.filter(
    (file) => !held.some((ignore) => ignore.test(file.path)),
  );

  return resolved.modules.map((module, index) => {
    const globs = [resolved.containerFiles(framework)[index]];
    const nets = globs.map(globToRegExp);

    return {
      layer: null,
      module: module.name,
      globs,
      hit: source.find((file) => nets.some((net) => net.test(file.path)))?.path ?? null,
    };
  });
}

function probeSites(
  blueprint: Blueprint,
  scanResult: ScanResult,
  ignores: string[],
): ProbeSite[] {
  return [
    ...containerProbeSites(blueprint, scanResult, ignores),
    ...layerProbeSites(blueprint, scanResult, ignores),
  ];
}

export function syntheticProbePaths(
  blueprint: Blueprint,
  scanResult: ScanResult,
  ignores: string[],
): string[] {
  return probeSites(blueprint, scanResult, ignores)
    .filter((site) => site.hit === null)
    .flatMap((site) => syntheticCandidates(site.globs));
}

function pickProbes(
  scanResult: ScanResult,
  blueprint: Blueprint,
): { path: string; layer: string | null; module?: string }[] {
  const { architecture } = blueprint;
  const declared = toArray(architecture.layerFilesIgnore);
  const ignores = declared.map(globToRegExp);
  const tests = resolveTestFiles(architecture.testFiles).architectureExemptions.map(globToRegExp);

  return probeSites(blueprint, scanResult, declared).flatMap(({
    layer, module, globs, hit,
  }) => {
    if (hit !== null) {
      return [{ path: hit, layer, ...(module ? { module } : {}) }];
    }

    const synthetic = syntheticCandidates(globs).find(
      (candidate) =>
        !ignores.some((ignore) => ignore.test(candidate))
        && !tests.some((test) => test.test(candidate)),
    );

    return synthetic ? [{ path: synthetic, layer, ...(module ? { module } : {}) }] : [];
  });
}

function optionsOf(value: unknown): unknown[] {
  // Stryker disable next-line ArrayDeclaration: readers ignore a fabricated unmatched option.
  return activeOptions(value)?.slice(1) ?? [];
}

function activeOptions(value: unknown): unknown[] | null {
  if (value == null) {
    return null;
  }

  const options = Array.isArray(value) ? value : [value];

  return options[0] === 0 || options[0] === 'off' ? null : options;
}

function resolvedStructural(rules: Record<string, unknown>): {
  groups: Set<string>;
  paths: Set<string>;
  selectors: Set<string>;
  globals: Set<string>;
  relativeEscape: boolean;
  importBoundary: string | null;
  unreadable: number;
} {
  const imports = readPatternGroups(rules['no-restricted-imports']);
  const paths = readRestrictedPaths(rules['no-restricted-imports']);
  const selectors = readNamed(rules['no-restricted-syntax'], 'selector');
  const globals = readNamed(rules['no-restricted-globals'], 'name');
  const importBoundary = readImportBoundary(rules['blueprint/import-boundary']);

  return {
    groups: imports.values,
    paths: paths.values,
    selectors: selectors.values,
    globals: globals.values,
    relativeEscape: activeOptions(rules['blueprint/relative-escape']) !== null,
    importBoundary,
    unreadable: imports.unreadable + paths.unreadable + selectors.unreadable + globals.unreadable,
  };
}

function readImportBoundary(entry: unknown): string {
  const option = activeOptions(entry)?.[1] as { architecture?: unknown } | undefined;

  return String(JSON.stringify(option?.architecture));
}

interface ReadEntries {
  values: Set<string>;
  unreadable: number;
}

function readPatternGroups(entry: unknown): ReadEntries {
  const values = new Set<string>();
  let unreadable = 0;

  for (const option of optionsOf(entry)) {
    const patterns = (option as { patterns?: unknown[] })?.patterns;

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

function readRestrictedPaths(entry: unknown): ReadEntries {
  const values = new Set<string>();
  let unreadable = 0;

  for (const option of optionsOf(entry)) {
    const paths = (option as { paths?: unknown[] })?.paths;

    if (!Array.isArray(paths)) {
      continue;
    }

    for (const item of paths) {
      const name = (item as { name?: unknown })?.name;

      if (typeof name === 'string' && name) {
        values.add(name);
      } else {
        unreadable++;
      }
    }
  }

  return { values, unreadable };
}

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

  wired: boolean;

  merged: boolean;

  hasTypescript: boolean;
  load: (name: string, root: string) => Promise<unknown>;
}

export interface WiringResult {
  check: DoctorCheck;

  probed: boolean;
}

export async function wiringCheck(params: WiringParams): Promise<WiringResult> {
  const { blueprint, scanResult, wired, merged } = params;
  const LABEL = label(merged);

  if (!wired) {
    return {
      check: {
        label: 'emitted rules survive the eslint config (skipped — eslint not wired)',
        ok: true,
        skipped: 'eslint not wired — the wiring check above is the red for that',
      },
      probed: false,
    };
  }

  const probes = pickProbes(scanResult, blueprint);

  if (!probes.length) {
    return {
      check: {
        label: `${LABEL} (skipped — no probe derivable from the architecture globs)`,
        ok: true,
      },
      probed: false,
    };
  }

  return { check: await comparedTo(params, probes, LABEL), probed: true };
}

async function comparedTo(
  params: WiringParams,
  probes: ReturnType<typeof pickProbes>,
  LABEL: string,
): Promise<DoctorCheck> {
  const { merged } = params;
  let survey: { lost: string[]; unreadable: number };

  try {
    survey = await surveyProbes(params, probes);
  } catch (error) {
    return unresolvableConfig(LABEL, merged, error);
  }

  if (!survey.lost.length) {
    return surviving(LABEL, survey.unreadable);
  }

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

    const label = [probe.module, probe.layer].filter(Boolean).join('/');

    lost.push(...losses(
      probe.layer === null
        ? expectedContainerStructural(blueprint, probe.module as string)
        : expectedStructural(blueprint, probe.layer, probe.module),
      resolved,
    )
      .map((loss) => `${label}: ${loss}`));

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

function surviving(label: string, unreadable: number): DoctorCheck {
  const note = unreadable === 0
    ? undefined
    : `${unreadable} restricted-import/syntax/globals entr${unreadable === 1 ? 'y' : 'ies'} `
      + 'in the resolved config could not be read by this check (not a blueprint entry, or '
      + 'a hand-folded one that drifted) — they are not compared, so a typo in one would '
      + 'not surface here';

  return { label: `${label} (${SCOPE})`, ok: true, detail: note };
}

function losses(
  expected: ReturnType<typeof expectedStructural>,
  resolved: ReturnType<typeof resolvedStructural>,
): string[] {
  const lost: string[] = [];

  const [groups, paths, selectors, globals] = [
    [...expected.groups].filter((group) => !resolved.groups.has(group)),
    [...expected.paths].filter((path) => !resolved.paths.has(path)),
    [...expected.selectors].filter((s) => !resolved.selectors.has(s)),
    [...expected.globals].filter((name) => !resolved.globals.has(name)),
  ];

  if (groups.length) {
    lost.push(`no-restricted-imports lost ${groups.length} structural pattern group(s)`);
  }

  if (paths.length) {
    lost.push(`no-restricted-imports lost ${paths.length} structural path(s)`);
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

  if (resolved.importBoundary !== expected.importBoundary) {
    lost.push('blueprint/import-boundary is missing, off, or its architecture policy was weakened');
  }

  return lost;
}
