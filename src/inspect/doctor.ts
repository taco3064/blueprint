import fs from 'node:fs';
import path from 'node:path';

import { detect, loadProjectModule, pathAliasKeys, quotedIn, resolveBlueprint } from '../project';
import type { ProjectState, ResolveOptions } from '../project';
import type { Blueprint } from '../config';
import { analyze } from './analyze';
import { BASELINE_FILE, parseBaseline, splitByBaseline } from './baseline';
import { computeCoverage, coverageSummary, vacuousNextStep } from './coverage';
import { hasErrors } from './report';
import { scan } from './scan';
import type { DoctorCheck } from './types';
import { wiringCheck } from './wiring';

export interface DoctorOptions extends ResolveOptions {
  /** Emit machine-readable JSON instead of the checklist. */
  json?: boolean;
  /** Output sink (default `console.log`). */
  log?: (message: string) => void;
  /** Load a module from the project's dependency tree (default: real import). */
  loadModule?: (name: string, root: string) => Promise<unknown>;
}

export type { DoctorCheck } from './types';

const SUPPRESSIONS_FILE = 'eslint-suppressions.json';

/**
 * The lint side of the debt ledger (ESLint ≥ 9.24 bulk suppressions). Doctor
 * cannot re-run eslint (read-only, zero deps), but it CAN catch the cheap
 * drift: suppressed entries whose file no longer exists, or an unreadable
 * ledger. Absent file = the ledger is simply not in use — fine.
 */
function suppressionsCheck(root: string): DoctorCheck {
  const label = 'lint suppressions ledger current';
  const file = path.join(root, SUPPRESSIONS_FILE);

  if (!fs.existsSync(file)) return { label: `${label} (not in use)`, ok: true };

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

  return { label, ok: true };
}

/**
 * Bundler configs the alias check scans beyond the vite config `detect`
 * already reads — the webpack-era and current homes of a resolve alias. A
 * check that cannot see where the alias is actually wired would be a forever-
 * red gate with no way to appease it.
 */
const BUNDLER_FILES = ['webpack.config', 'vue.config', 'next.config', 'rsbuild.config']
  .flatMap((name) => ['js', 'cjs', 'mjs', 'ts'].map((ext) => `${name}.${ext}`));

/**
 * The alias is required in the config precisely because a wrong default would
 * silently pass illegal imports — but a *declared-yet-unwired* alias is the
 * inverse trap: the contract tells agents to import through a prefix no
 * toolchain resolves. Wired = the alias appears in tsconfig/jsconfig `paths`
 * (any target), or a bundler config's text carries it as a quoted token
 * (`quotedIn` — the standard init's alias instructs share).
 */
function aliasCheck(root: string, blueprint: Blueprint, state: ProjectState): DoctorCheck {
  const { alias, additionalAliases, sourceRoot } = blueprint.architecture;
  const declared = pathAliasKeys(state.tsconfigs);

  const bundlerTexts = [
    state.viteConfig?.text,
    ...BUNDLER_FILES.map((file) => {
      const full = path.join(root, file);

      return fs.existsSync(full) ? fs.readFileSync(full, 'utf-8') : undefined;
    }),
  ].filter((text): text is string => text !== undefined);

  const unwired = [alias, ...Object.keys(additionalAliases ?? {})].filter(
    (name) => !declared.has(name) && !bundlerTexts.some((text) => quotedIn(text, name)),
  );

  if (!unwired.length) return { label: 'import alias wired to the toolchain', ok: true };

  const dir = sourceRoot === '.' ? '.' : `./${sourceRoot ?? 'src'}`;

  return {
    label: 'import alias wired to the toolchain',
    ok: false,
    detail: `${unwired.map((name) => `"${name}"`).join(', ')} resolves nowhere — declare it in `
      + `tsconfig compilerOptions.paths ("${unwired[0]}/*": ["${dir}/*"]) or your bundler's `
      + 'alias config, or the agent contract points at unresolvable imports',
  };
}

/** Reference files are named `<name>.blueprint.<ext>` — never the config itself. */
function referenceFiles(root: string): string[] {
  return fs
    .readdirSync(root)
    .filter((name) => name.includes('.blueprint.'))
    .sort();
}

/**
 * Run `blueprint doctor` in `root`. Read-only. Answers the one question the
 * adoption prompt's acceptance clause asks — "is adoption actually finished?"
 * — as a checklist: config present, no leftover reference files, eslint wired
 * to emitLint, the declared alias wired to the toolchain, the emitted rules
 * still alive in the merged eslint config, and the architecture clean under
 * the baseline (its detail states the coverage, so a vacuous green is
 * visible). Exit 0 iff every check passes, so it drops into CI or an agent's
 * verify loop.
 * @group Runtimes
 * @example
 * const { ok } = await runDoctor(process.cwd());
 *
 * process.exitCode = ok ? 0 : 1;
 */
export async function runDoctor(
  root: string,
  options: DoctorOptions = {},
): Promise<{ ok: boolean; checks: DoctorCheck[] }> {
  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);

  // No config = nothing to check; every other check assumes one exists.
  if (!state.hasConfig) {
    const checks: DoctorCheck[] = [
      {
        label: 'blueprint.config.mjs present',
        ok: false,
        detail: 'run `blueprint init` (or `init --authoring` on an existing repo) first',
      },
    ];

    emit(log, checks, options.json);

    return { ok: false, checks };
  }

  const references = referenceFiles(root);
  const eslintWired = state.ownedEslintConfig !== undefined || state.wiredEslintConfig;

  const { blueprint } = await resolveBlueprint(root, state, options);
  const scanResult = scan(root, blueprint.architecture.sourceRoot);
  const findings = analyze(scanResult, blueprint);
  const coverage = computeCoverage(scanResult, blueprint);

  const recorded = fs.existsSync(path.join(root, BASELINE_FILE))
    ? parseBaseline(fs.readFileSync(path.join(root, BASELINE_FILE), 'utf-8'))
    : [];

  const fresh = splitByBaseline(findings, recorded).fresh;

  const wiring = await wiringCheck({
    root,
    blueprint,
    scanResult,
    wired: eslintWired,
    load: options.loadModule ?? loadProjectModule,
  });

  const checks: DoctorCheck[] = [
    { label: 'blueprint.config.mjs present', ok: true },
    {
      label: 'no leftover reference files',
      ok: references.length === 0,
      detail: references.length
        ? `merge and delete: ${references.join(', ')} — adoption is not done while a reference remains`
        : undefined,
    },
    {
      label: 'eslint wired to emitLint',
      ok: eslintWired,
      detail: eslintWired
        ? undefined
        : state.eslintConfigShape === 'legacy'
          ? `${state.legacyEslintConfig} is legacy — migrate to flat config, then spread ...emitLint(blueprint)`
          : 'spread ...emitLint(blueprint) into your eslint config (see eslint.config.blueprint.mjs)',
    },
    aliasCheck(root, blueprint, state),
    wiring,
    {
      label: 'architecture clean (findings covered by the baseline)',
      ok: !hasErrors(fresh),
      // The green states its reach — a clean report over an empty net is
      // vacuous, and the reader deserves to see which one they got.
      detail: hasErrors(fresh)
        ? `${fresh.length} finding(s) outside the baseline — fix, or \`blueprint inspect --update-baseline\``
        : coverage.sourceFiles > 0 && coverage.layerFiles === 0
          ? `clean, but vacuous — layer globs match 0 of ${coverage.sourceFiles} source file(s); the wiring is done — ${vacuousNextStep(blueprint)}`
          : coverageSummary(coverage),
    },
    suppressionsCheck(root),
  ];

  const ok = checks.every((check) => check.ok);

  emit(log, checks, options.json);

  return { ok, checks };
}

function emit(log: (m: string) => void, checks: DoctorCheck[], json?: boolean): void {
  if (json) {
    log(JSON.stringify({ ok: checks.every((check) => check.ok), checks }, null, 2));

    return;
  }

  const failed = checks.filter((check) => !check.ok).length;

  log(
    [
      'blueprint doctor',
      ...checks.map(
        (check) =>
          `  ${check.ok ? '✓' : '✗'} ${check.label}${check.detail ? `\n      ${check.detail}` : ''}`,
      ),
      '',
      failed === 0
        ? `✓ Adoption complete — all ${checks.length} checks passed.`
        : `✗ Adoption incomplete — ${failed} of ${checks.length} check(s) failed.`,
    ].join('\n'),
  );
}
