import fs from 'node:fs';
import path from 'node:path';

import { defaultAgentPaths, emitAgentFiles } from '../emit/agent';
import {
  AUTHORING_FILE,
  COMMAND_FILE,
  detect,
  loadProjectModule,
  pathAliasKeys,
  quotedIn,
  resolveBlueprint,
} from '../project';
import type { ProjectState, ResolveOptions } from '../project';
import type { Blueprint } from '../config';
import { analyze } from './analyze';
import { BASELINE_FILE, parseBaseline, splitByBaseline } from './baseline';
import { computeCoverage, coverageSummary, vacuousNextStep } from './coverage';
import { hasErrors } from './report';
import { scan } from './scan';
import type { DoctorCheck } from './types';
import { wiringCheck } from './wiring';

// Deliberately NOT extending ResolveOptions: doctor fails loud without a
// config, and `framework` only steers the no-config preset fallback — a
// `--framework` here would be an inert flag that lies to whoever reads it.
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

  // Zero-debt doctrine, lint side: running --suppress-all on a clean lint
  // writes an EMPTY ledger — ceremony, and asymmetric with the baseline
  // (which writes no file on zero debt). Green, but say what to do.
  if (!Object.keys(entries).length) {
    return {
      label,
      ok: true,
      detail: `${SUPPRESSIONS_FILE} is empty — nothing is suppressed, so the file is ceremony; delete it (zero lint debt needs no ledger)`,
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
 * Contract files outside the declared emit set. Init removes a wholly-
 * generated one on its next run, but one carrying hand-written content only
 * gets an instruct — and without this check, that orphan lives on with every
 * gate green (field issue #2/#3: a narrowed emit.agents left AGENTS.md
 * behind and nothing ever said so again).
 */
function staleContracts(root: string, blueprint: Blueprint): string[] {
  const emitted = new Set(emitAgentFiles(blueprint).map((file) => file.path));

  return defaultAgentPaths()
    .filter((spec) => !emitted.has(spec.path))
    .filter((spec) => {
      const full = path.join(root, spec.path);

      if (!fs.existsSync(full)) return false;

      // Own-strategy rule files are wholly generated by construction; a
      // merge file counts only when it carries the managed marker block.
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

  const authoring = [AUTHORING_FILE, COMMAND_FILE].filter((file) =>
    fs.existsSync(path.join(root, file)));

  const eslintWired = state.ownedEslintConfig !== undefined || state.wiredEslintConfig;

  const { blueprint } = await resolveBlueprint(root, state, options);
  const stale = staleContracts(root, blueprint);
  const scanResult = scan(root, blueprint.architecture.sourceRoot);
  const findings = analyze(scanResult, blueprint);
  const coverage = computeCoverage(scanResult, blueprint);

  const recorded = fs.existsSync(path.join(root, BASELINE_FILE))
    ? parseBaseline(fs.readFileSync(path.join(root, BASELINE_FILE), 'utf-8'))
    : [];

  const { fresh, suppressed } = splitByBaseline(findings, recorded);

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
      label: 'no leftover reference, authoring, or stale contract files',
      ok: references.length === 0 && stale.length === 0 && authoring.length === 0,
      detail: references.length || stale.length || authoring.length
        ? [
            ...(references.length
              ? [`merge and delete: ${references.join(', ')} — adoption is not done while a reference remains`]
              : []),
            // The playbook defines "done" as including its own cleanup —
            // doctor saying "complete" over a live playbook told a second,
            // contradicting story (field issue #13).
            ...(authoring.length
              ? [`${authoring.join(', ')}: authoring artifacts still on disk — the playbook's final step deletes them; a doctor run mid-authoring is EXPECTED to fail here`]
              : []),
            ...(stale.length
              ? [`${stale.join(', ')}: carries the BLUEPRINT block but is not among the emitted targets — a wholly-generated file is removed by the next init; one with hand-written content needs its block removed by hand`]
              : []),
          ].join('; ')
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
      // The check judges net of the baseline, but the label only mentions
      // the ledger while it is actually covering something — inspect says
      // "no baseline needed" on a truly clean repo, and doctor claiming
      // coverage by a ledger that does not exist told the opposite story
      // about the same state (field run #10).
      label: suppressed > 0
        ? 'architecture clean (findings covered by the baseline)'
        : 'architecture clean',
      ok: !hasErrors(fresh),
      // The green states its reach — a clean report over an empty net is
      // vacuous, and the reader deserves to see which one they got.
      detail: hasErrors(fresh)
        ? suppressed > 0
          ? `${fresh.length} finding(s) outside the baseline — fix, or \`blueprint inspect --update-baseline\``
          : `${fresh.length} finding(s) — fix, or lock as accepted debt: \`blueprint inspect --update-baseline\``
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
