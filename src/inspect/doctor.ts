import fs from 'node:fs';
import path from 'node:path';

import { defaultAgentPaths, emitAgentFiles } from '../emit/agent';

import {
  divergentReadingClause,
  outOfScanReachClause,
  ownersCallClause,
} from '../emit/lint/patterns';
import {
  AUTHORING_FILE,
  COMMAND_FILE,
  describeUnreadable,
  detect,
  loadProjectModule,
  pathAliasKeys,
  quotedIn,
  resolveBlueprint,
  unreadableTsconfigs,
} from '../project';
import type { ProjectState, ResolveOptions } from '../project';
import type { Blueprint } from '../config';
import { analyze } from './analyze';
import { BASELINE_FILE, parseBaseline, splitByBaseline } from './baseline';
import {
  computeCoverage,
  coverageSummary,
  unreachedIgnoreGlobs,
  vacuousNextStep,
} from './coverage';
import type { Coverage } from './coverage';
import { hasErrors } from './report';
import { outsideScanReach, scan } from './scan';
import type { DoctorCheck, Finding } from './types';
import { wiringCheck } from './wiring';

export interface DoctorOptions {
  /** Emit machine-readable JSON instead of the checklist. */
  json?: boolean;
  /** Output sink (default `console.log`). */
  log?: (message: string) => void;
  /** Load a module from the project's dependency tree (default: real import). */
  loadModule?: (name: string, root: string) => Promise<unknown>;
  /** Load an existing blueprint.config (default dynamic import). */
  loadConfig?: ResolveOptions['loadConfig'];
}

export type { DoctorCheck } from './types';

export type DoctorVerdict = 'complete' | 'unverified' | 'incomplete';

const SUPPRESSIONS_FILE = 'eslint-suppressions.json';

function suppressionsCheck(root: string): DoctorCheck {
  const label = 'lint suppressions ledger current';
  const file = path.join(root, SUPPRESSIONS_FILE);

  if (!fs.existsSync(file)) {
    return { label: `${label} (not in use)`, ok: true };
  }

  let entries: Record<string, unknown>;

  try {
    entries = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {
      label,
      ok: false,
      detail: `${SUPPRESSIONS_FILE} is not valid JSON — regenerate with: npx eslint . --suppress-all`,
    };
  }

  const stale = Object.keys(entries).filter((entry) => !fs.existsSync(path.join(root, entry)));

  if (stale.length) {
    return {
      label,
      ok: false,
      detail: `suppressed files no longer exist (${stale.join(', ')}) — run: npx eslint . --prune-suppressions`,
    };
  }

  if (!Object.keys(entries).length) {
    return {
      label,
      ok: true,
      detail: `${SUPPRESSIONS_FILE} is empty — nothing is suppressed, so the file is ceremony; delete it (zero lint debt needs no ledger)`,
    };
  }

  return { label, ok: true };
}

const BUNDLER_FILES = ['webpack.config', 'vue.config', 'next.config', 'rsbuild.config']
  .flatMap((name) => ['js', 'cjs', 'mjs', 'ts'].map((ext) => `${name}.${ext}`));

function aliasCheck(root: string, blueprint: Blueprint, state: ProjectState): DoctorCheck {
  const { alias, additionalAliases, sourceRoot } = blueprint.architecture;
  const declared = pathAliasKeys(state.tsconfigs);

  const bundlerTexts = BUNDLER_FILES.map((file) => path.join(root, file))
    .filter((full) => fs.existsSync(full))
    .map((full) => fs.readFileSync(full, 'utf-8'));

  if (state.viteConfig) {
    bundlerTexts.push(state.viteConfig.text);
  }

  const unwired = [alias, ...Object.keys(additionalAliases ?? {})].filter(
    (name) => !declared.has(name) && !bundlerTexts.some((text) => quotedIn(text, name)),
  );

  if (!unwired.length) {
    return { label: 'import alias wired to the toolchain', ok: true };
  }

  const dir = sourceRoot === '.' ? '.' : `./${sourceRoot ?? 'src'}`;

  const unreadable = unreadableTsconfigs(state.tsconfigs);

  return {
    label: 'import alias wired to the toolchain',
    ok: false,
    detail: `${unwired.map((name) => `"${name}"`).join(', ')} resolves nowhere — declare it in `
      + `tsconfig compilerOptions.paths ("${unwired[0]}/*": ["${dir}/*"]) or your bundler's `
      + 'alias config, or the agent contract points at unresolvable imports'
      + (unreadable.length
        ? ` — but fix ${describeUnreadable(unreadable)} first: this check could not read `
        + 'it, so an alias already declared in there would not have been seen'
        : ''),
  };
}

function referenceFiles(root: string): string[] {
  // Stryker disable next-line MethodExpression: supported test volumes already return name order.
  return fs
    .readdirSync(root)
    .filter((name) => name.includes('.blueprint.'))
    .sort();
}

function staleContracts(root: string, blueprint: Blueprint): string[] {
  const emitted = new Set(emitAgentFiles(blueprint).map((file) => file.path));

  return defaultAgentPaths()
    .filter((spec) => !emitted.has(spec.path))
    .filter((spec) => {
      const full = path.join(root, spec.path);

      if (!fs.existsSync(full)) {
        return false;
      }

      return (
        spec.strategy === 'own'
        || fs.readFileSync(full, 'utf-8').includes('<!-- BLUEPRINT:START -->')
      );
    })
    .map((spec) => spec.path)
    .sort();
}

/**
 * Run `blueprint doctor` in `root`. Read-only. Answers the one question the
 * adoption prompt's acceptance clause asks — "is adoption actually finished?"
 * — as a checklist: config present, no leftover reference files, eslint wired
 * to emitLint, the declared alias wired to the toolchain, the emitted rules
 * still alive in the merged eslint config, and the architecture clean under
 * the baseline (its detail states the coverage, so a vacuous green is
 * visible). Exit 0 iff every check passes, so you can gate on it — a git
 * hook, CI, an agent's verify loop.
 *
 * `ok` is "nothing failed", which the exit code follows. It is NOT "everything was
 * verified": a check that could not run rides on `ok: true` deliberately, so read
 * `verdict` when the difference matters — the JSON said `"ok": true` while the text
 * said `⊘ Adoption unverified` about the same run, and that gap nearly became a
 * green CI gate (field run #141).
 * @group Runtimes
 * @example
 * const { ok, verdict } = await runDoctor(process.cwd());
 *
 * process.exitCode = ok ? 0 : 1;
 *
 * if (verdict === 'unverified') console.warn('a check could not run');
 */
export async function runDoctor(
  root: string,
  options: DoctorOptions = {},
): Promise<{ ok: boolean; verdict: DoctorVerdict; checks: DoctorCheck[] }> {
  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);

  if (!state.hasConfig) {
    return noConfigResult(log, options.json);
  }

  const { blueprint } = await resolveBlueprint(root, state, options);
  const scanResult = scan(root, blueprint.architecture.sourceRoot);

  const coverage = computeCoverage(scanResult, blueprint, state.hasTypescript);

  const { checks, probed } = await doctorChecks(
    root,
    { state, blueprint, scanResult, coverage, options },
  );

  const ok = checks.every((check) => check.ok);

  const notes = [
    unreachedIgnoreNote(scanResult, blueprint, probed),

    coverage.testExemption,
    uncommittedNote(root),
  ].filter((note) => note !== undefined);

  emit(log, checks, { notes, json: options.json });

  return { ok, verdict: verdictOf(checks), checks };
}

function noConfigResult(
  log: (message: string) => void,
  json?: boolean,
): { ok: boolean; verdict: DoctorVerdict; checks: DoctorCheck[] } {
  const checks: DoctorCheck[] = [
    {
      label: 'blueprint.config.mjs present',
      ok: false,
      detail: 'run `blueprint init` (or `init --authoring` on an existing repo) first',
    },
  ];

  emit(log, checks, { json });

  return { ok: false, verdict: verdictOf(checks), checks };
}

async function doctorChecks(
  root: string,
  ctx: {
    state: ProjectState;
    blueprint: Blueprint;
    scanResult: ReturnType<typeof scan>;
    coverage: Coverage;
    options: DoctorOptions;
  },
): Promise<{ checks: DoctorCheck[]; probed: boolean }> {
  const { state, blueprint, scanResult, coverage, options } = ctx;
  const eslintWired = state.ownedEslintConfig !== undefined || state.wiredEslintConfig;

  const findings = analyze(scanResult, blueprint, state.dependencies);

  // Stryker disable next-line ArrayDeclaration: unmatched fabricated entries change no finding.
  const unrecorded: ReturnType<typeof parseBaseline> = [];

  const recorded = fs.existsSync(path.join(root, BASELINE_FILE))
    ? parseBaseline(fs.readFileSync(path.join(root, BASELINE_FILE), 'utf-8'))
    : unrecorded;

  const wiring = await wiringCheck({
    root,
    blueprint,
    scanResult,
    wired: eslintWired,

    merged: state.ownedEslintConfig === undefined,
    hasTypescript: state.hasTypescript,
    load: options.loadModule ?? loadProjectModule,
  });

  return {
    checks: [
      { label: 'blueprint.config.mjs present', ok: true },
      leftoversCheck(root, blueprint),
      eslintWiredCheck(state, eslintWired),
      aliasCheck(root, blueprint, state),
      wiring.check,
      architectureCheck(splitByBaseline(findings, recorded), coverage, blueprint),
      suppressionsCheck(root),
    ],
    probed: wiring.probed,
  };
}

function leftoversCheck(root: string, blueprint: Blueprint): DoctorCheck {
  const references = referenceFiles(root);

  const authoring = [AUTHORING_FILE, COMMAND_FILE].filter((file) =>
    fs.existsSync(path.join(root, file)));

  const stale = staleContracts(root, blueprint);

  return {
    label: 'no leftover reference, authoring, or stale contract files',
    ok: references.length === 0 && stale.length === 0 && authoring.length === 0,
    detail: references.length || stale.length || authoring.length
      ? [
          ...(references.length
            ? [`merge and delete: ${references.join(', ')} — adoption is not done while a reference remains`]
            : []),

          ...(authoring.length
            ? [`${authoring.join(', ')}: authoring artifacts still on disk — the playbook's final step deletes them; a doctor run mid-authoring is EXPECTED to fail here`]
            : []),
          ...(stale.length
            ? [`${stale.join(', ')}: carries the BLUEPRINT block but is not among the emitted targets — a wholly-generated file is removed by the next init; one with hand-written content needs its block removed by hand`]
            : []),
        ].join('; ')
      : undefined,
  };
}

function eslintWiredCheck(state: ProjectState, eslintWired: boolean): DoctorCheck {
  return {
    label: 'eslint wired to emitLint',
    ok: eslintWired,
    detail: eslintWired
      ? undefined
      : state.eslintConfigShape === 'legacy'
        ? `${state.legacyEslintConfig} is legacy — migrate to flat config, then spread ...emitLint(blueprint)`
        : 'spread ...emitLint(blueprint) into your eslint config (see '
          + 'eslint.config.blueprint.mjs)',
  };
}

function architectureCheck(
  baseline: { fresh: Finding[]; suppressed: number },
  coverage: Coverage,
  blueprint: Blueprint,
): DoctorCheck {
  const { fresh, suppressed } = baseline;

  return {
    label: suppressed > 0
      ? 'architecture clean (findings covered by the baseline)'
      : 'architecture clean',
    ok: !hasErrors(fresh),

    detail: hasErrors(fresh)
      ? suppressed > 0
        ? `${fresh.length} finding(s) outside the baseline — fix, or \`blueprint inspect --update-baseline\``
        : `${fresh.length} finding(s) — fix, or lock as accepted debt: \`blueprint inspect --update-baseline\``
      : coverage.sourceFiles > 0 && coverage.layerFiles === 0
        && (coverage.ignoredFiles?.length ?? 0) === 0
        ? `clean, but vacuous — layer globs match 0 of ${coverage.sourceFiles} source file(s); the wiring is done — ${vacuousNextStep(blueprint)}`
        : coverageSummary(coverage),
  };
}

function uncommittedNote(root: string): string | undefined {
  if (fs.existsSync(path.join(root, '.git'))) {
    return undefined;
  }

  return 'Not a version-controlled repo, so nothing adoption wrote is committed — '
    + 'and a ratchet that lives only in an uncommitted working tree is not installed: '
    + 'the next clone starts without it and CI has nothing to run. Initialise version '
    + 'control and commit these files to finish. Doing that is the owner\'s call, never '
    + 'an adopting agent\'s.';
}

function unreachedIgnoreNote(
  scanResult: ReturnType<typeof scan>,
  blueprint: Blueprint,
  probed: boolean,
): string | undefined {
  const dead = unreachedIgnoreGlobs(scanResult, blueprint);

  if (!dead.length) {
    return undefined;
  }

  const { sourceRoot } = blueprint.architecture;
  const reach = dead.map((glob) => ({ glob, unreached: outsideScanReach(glob, sourceRoot) }));

  const repoWideThere = 'it is unreached only here, and the config `emit/lint` emits '
    + 'still applies it wherever it does match';

  const tail = outOfScanReachClause(reach, repoWideThere)
    + ownersCallClause(reach, {
      opening: 'Inside the scanned tree a mistyped glob and a convention',
      noun: 'exclusion',
    })
    + divergentReadingClause(reach);

  return '`architecture.layerFilesIgnore` — no file here matches '
    + `${dead.map((glob) => `\`${glob}\``).join(', ')}, and neither does the stand-in `
    + 'path doctor uses to probe a layer that has none. So nothing this run read is held '
    + 'out through it: no scanned file is dropped from the layers'
    + (probed
      ? ', and doctor\'s merge-survival check picks its probe as if the entry were absent'
      : '')
    + '. That is this scan\'s reach, not a verdict on the entry — `emit/lint` copies it '
    + 'into ESLint\'s `ignores` verbatim, and an entry carrying no `files` beside it is a '
    + 'repo-wide ignore there'
    + `${tail}.`;
}

function verdictOf(checks: DoctorCheck[]): DoctorVerdict {
  if (checks.some((check) => !check.ok)) {
    return 'incomplete';
  }

  return checks.some((check) => check.skipped) ? 'unverified' : 'complete';
}

function summarize(checks: DoctorCheck[]): {
  verdict: DoctorVerdict;
  passed: number;
  failed: number;
  skipped: number;
  banner: string;
} {
  const failed = checks.filter((check) => !check.ok).length;
  const skipped = checks.filter((check) => check.skipped).length;
  const passed = checks.length - failed - skipped;

  const banner = failed === 0 && !skipped
    ? `✓ Adoption complete — all ${checks.length} checks passed.`
    : failed === 0
      ? `⊘ Adoption unverified — ${passed} of ${checks.length} checks passed, `
      + `${skipped} could not run (⊘ above). Nothing failed, and nothing here `
      + 'proves what those checks cover.'

      : `✗ Adoption incomplete — ${failed} of ${checks.length} check(s) failed`
        + `${skipped ? `, and ${skipped} could not run (⊘ above) — fixing the ✗ leaves those still unproven` : ''}.`;

  return { verdict: verdictOf(checks), passed, failed, skipped, banner };
}

function emit(
  log: (m: string) => void,
  checks: DoctorCheck[],
  report: { notes?: string[]; json?: boolean },
): void {
  const { notes = [], json } = report;
  const { verdict, passed, failed, skipped, banner } = summarize(checks);

  if (json) {
    log(JSON.stringify(
      {
        ok: checks.every((check) => check.ok),
        verdict,
        summary: banner,
        counts: { total: checks.length, passed, failed, skipped },
        checks,

        note: notes.length ? notes.join('\n') : undefined,
      },
      null,
      2,
    ));

    return;
  }

  log(
    [
      'blueprint doctor',
      ...checks.map((check) => {
        const mark = check.ok ? (check.skipped ? '⊘' : '✓') : '✗';
        const under = check.skipped ?? check.detail;

        return `  ${mark} ${check.label}${under ? `\n      ${under}` : ''}`;
      }),
      '',
      banner,

      ...notes.map((note) => `  ${note}`),
    ].join('\n'),
  );
}
