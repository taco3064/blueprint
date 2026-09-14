import fs from 'node:fs';
import path from 'node:path';

import { defaultAgentPaths, emitAgentFiles } from '../emit/agent';

import {
  AUTHORING_FILE,
  assessLintEntrypoint,
  COMMAND_FILE,
  aliasConsumerEvidence,
  detect,
  loadProjectModule,
  readTransformationObligation,
  resolveBlueprint,
  toolchainForProject,
} from '../project';
import type { ProjectState, ResolveOptions } from '../project';
import { resolveArchitecture } from '../config';
import type { Blueprint } from '../config';
import {
  renderDoctorCheck,
  renderDoctorReport,
  renderUncommittedDoctorNote,
  renderUnreachedIgnoreNote as renderOperationalUnreachedIgnoreNote,
} from '../operational-contract';
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
import { importAnalysis, outsideScanReach, scan } from './scan';
import type { DoctorCheck, Finding } from './types';
import { liveLintCheck } from './doctor-lint';
import { verifyTransformationObligation } from './transformation-obligation';
import { runLiveLint } from './lint-runtime';
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
  /** @internal Execute the proven ESLint leg without a shell. */
  runLint?: typeof runLiveLint;
}

export type { DoctorCheck } from './types';

export type DoctorVerdict = 'complete' | 'unverified' | 'incomplete';

const SUPPRESSIONS_FILE = 'eslint-suppressions.json';

function suppressionsCheck(root: string): DoctorCheck {
  const file = path.join(root, SUPPRESSIONS_FILE);

  if (!fs.existsSync(file)) {
    return renderDoctorCheck({ kind: 'suppressions', status: 'unused' });
  }

  let entries: Record<string, unknown>;

  try {
    entries = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
  } catch {
    return renderDoctorCheck({ kind: 'suppressions', status: 'invalid-json' });
  }

  const stale = Object.keys(entries).filter((entry) => !fs.existsSync(path.join(root, entry)));

  if (stale.length) {
    return renderDoctorCheck({ kind: 'suppressions', status: 'stale', files: stale });
  }

  if (!Object.keys(entries).length) {
    return renderDoctorCheck({ kind: 'suppressions', status: 'empty' });
  }

  return renderDoctorCheck({ kind: 'suppressions', status: 'valid' });
}

function aliasChecks(root: string, blueprint: Blueprint, state: ProjectState): DoctorCheck[] {
  const architecture = resolveArchitecture(blueprint.architecture);
  const toolchain = toolchainForProject(state, architecture.sourceRoot);

  return aliasConsumerEvidence(root, blueprint.architecture, toolchain).map((evidence) =>
    renderDoctorCheck({ kind: 'alias-consumer', evidence, sourceRoot: architecture.sourceRoot }));
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
 * to emitLint, the normal lint entrypoint reaches eslint, its safely replayable
 * project-local ESLint leg passes live, the declared alias is wired to the
 * toolchain, the emitted rules remain alive in the merged eslint config, the
 * architecture is clean under the baseline (with visible coverage), and the
 * lint suppressions ledger is current. Exit 0 iff no check fails, so you can
 * gate on it — a git hook, CI, or an agent's verify loop.
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
  const scanResult = scan(root, resolveArchitecture(blueprint.architecture).sourceRoot);

  const coverage = computeCoverage(scanResult, blueprint, state.hasTypescript);

  const { checks, probed } = await doctorChecks(
    root,
    { state, blueprint, scanResult, coverage, options },
  );

  const ok = checks.every((check) => check.ok);

  const notes = [
    unreachedIgnoreNote(scanResult, blueprint, probed),

    coverage.testExemption,
    uncommittedNote(state),
  ].filter((note) => note !== undefined);

  emit(log, checks, { notes, json: options.json });

  return { ok, verdict: verdictOf(checks), checks };
}

function noConfigResult(
  log: (message: string) => void,
  json?: boolean,
): { ok: boolean; verdict: DoctorVerdict; checks: DoctorCheck[] } {
  const checks: DoctorCheck[] = [
    renderDoctorCheck({ kind: 'config', present: false }),
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

  const lintAssessment = assessLintEntrypoint(state.localPackage);

  const lintDependencies = [...new Set(state.localPackage.dependencies
    .concat(state.toolchainPackage.dependencies))];

  const lintEvidence = lintAssessment.reachable
    ? (options.runLint ?? runLiveLint)(root, lintDependencies, lintAssessment)
    : runLiveLint(root, lintDependencies, lintAssessment);

  return {
    checks: [
      renderDoctorCheck({ kind: 'config', present: true }),
      ...transformationChecks(root, blueprint, state),
      leftoversCheck(root, blueprint),
      eslintWiredCheck(state, eslintWired),
      lintEntrypointCheck(lintAssessment),
      liveLintCheck(lintEvidence, lintAssessment),
      ...aliasChecks(root, blueprint, state),
      wiring.check,
      architectureCheck({
        baseline: splitByBaseline(findings, recorded),
        coverage,
        blueprint,
        analysis: importAnalysis(scanResult),
      }),
      suppressionsCheck(root),
    ],
    probed: wiring.probed,
  };
}

function transformationChecks(
  root: string,
  blueprint: Blueprint,
  state: ProjectState,
): DoctorCheck[] {
  let obligation;

  try {
    obligation = readTransformationObligation(root);
  } catch (error) {
    return [renderDoctorCheck({
      kind: 'transformation',
      status: 'invalid',
      detail: error instanceof Error ? error.message : String(error),
    })];
  }

  if (!obligation) {
    return [];
  }

  const verification = verifyTransformationObligation({ root, obligation, blueprint, state });

  return [renderDoctorCheck({
    kind: 'transformation',
    status: 'pending',
    verified: verification.ok,
    failures: verification.failures,
  })];
}

function leftoversCheck(root: string, blueprint: Blueprint): DoctorCheck {
  const references = referenceFiles(root);

  const authoring = [AUTHORING_FILE, COMMAND_FILE].filter((file) =>
    fs.existsSync(path.join(root, file)));

  const stale = staleContracts(root, blueprint);

  return renderDoctorCheck({ kind: 'leftovers', references, authoring, stale });
}

function eslintWiredCheck(state: ProjectState, eslintWired: boolean): DoctorCheck {
  return renderDoctorCheck({
    kind: 'eslint-wired',
    wired: eslintWired,
    legacyConfig: state.legacyEslintConfig,
  });
}

function lintEntrypointCheck(
  assessment: ReturnType<typeof assessLintEntrypoint>,
): DoctorCheck {
  return assessment.reachable
    ? renderDoctorCheck({ kind: 'lint-entrypoint', reachable: true })
    : renderDoctorCheck({
        kind: 'lint-entrypoint',
        reachable: false,
        reason: assessment.reason === 'missing-lint' ? 'missing-lint' : 'unreachable',
        ...(assessment.entrypoint ? { entrypoint: assessment.entrypoint } : {}),
      });
}

function architectureCheck(
  input: {
    baseline: { fresh: Finding[]; suppressed: number };
    coverage: Coverage;
    blueprint: Blueprint;
    analysis: ReturnType<typeof importAnalysis>;
  },
): DoctorCheck {
  const { baseline, coverage, blueprint, analysis } = input;
  const { fresh, suppressed } = baseline;

  const vacuous = coverage.sourceFiles > 0 && coverage.layerFiles === 0
    && (coverage.ignoredFiles?.length ?? 0) === 0;

  return renderDoctorCheck({
    kind: 'architecture',
    fresh: fresh.length,
    hasErrors: hasErrors(fresh),
    suppressed,
    coverage: coverageSummary(coverage),
    importAnalysis: analysis,
    ...(vacuous
      ? { vacuous: { sourceFiles: coverage.sourceFiles, nextStep: vacuousNextStep(blueprint) } }
      : {}),
  });
}

function uncommittedNote(state: ProjectState): string | undefined {
  if (state.repositoryRoot !== undefined) {
    return undefined;
  }

  return renderUncommittedDoctorNote();
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

  const sourceRoot = resolveArchitecture(blueprint.architecture).sourceRoot;
  const reach = dead.map((glob) => ({ glob, unreached: outsideScanReach(glob, sourceRoot) }));

  return renderOperationalUnreachedIgnoreNote({ globs: dead, reach, probed });
}

function verdictOf(checks: DoctorCheck[]): DoctorVerdict {
  if (checks.some((check) => !check.ok)) {
    return 'incomplete';
  }

  return checks.some((check) => check.skipped) ? 'unverified' : 'complete';
}

function emit(
  log: (m: string) => void,
  checks: DoctorCheck[],
  report: { notes?: string[]; json?: boolean },
): void {
  log(renderDoctorReport(checks, report));
}
