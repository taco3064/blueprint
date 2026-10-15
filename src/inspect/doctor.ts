import fs from 'node:fs';
import path from 'node:path';

import { defaultAgentPaths, emitAgentFiles } from '../emit/agent';

import {
  AUTHORING_FILE,
  assessLintEntrypoint,
  assertTransformationAuthority,
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
import type { AdoptionAssessment, Blueprint } from '../config';
import {
  renderDoctorCheck,
  renderOutsideScopeDoctorCheck,
  renderDoctorReport,
  renderUncommittedDoctorNote,
  renderUnreachedIgnoreNote as renderOperationalUnreachedIgnoreNote,
} from '../operational-contract';
import type { ArchitectureFactsView } from '../operational-contract';
import { collectArchitectureFacts } from './facts';
import type { ArchitectureFacts } from './facts';
import {
  assessmentApplication, assessmentBaseline, assembleDoctorAssessment, noConfigResult, verdictOf,
} from './assessment-runtime';
import {
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
import { prohibitionDoctorChecks, verifyProhibitions } from './prohibition-wiring';
import type { ProhibitionEvidence } from './prohibition-wiring';
import { observedProhibitions } from './prohibition-evidence';

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

function suppressionsCheck(root: string, ledger: string): DoctorCheck {
  const file = path.join(root, SUPPRESSIONS_FILE);

  if (!fs.existsSync(file)) {
    return renderDoctorCheck({ kind: 'suppressions', ledger, status: 'unused' });
  }

  let entries: Record<string, unknown>;

  try {
    entries = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
  } catch {
    return renderDoctorCheck({ kind: 'suppressions', ledger, status: 'invalid-json' });
  }

  const stale = Object.keys(entries).filter((entry) => !fs.existsSync(path.join(root, entry)));

  if (stale.length) {
    return renderDoctorCheck({ kind: 'suppressions', ledger, status: 'stale', files: stale });
  }

  if (!Object.keys(entries).length) {
    return renderDoctorCheck({ kind: 'suppressions', ledger, status: 'empty' });
  }

  return renderDoctorCheck({ kind: 'suppressions', ledger, status: 'valid' });
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
 * Assess current-config executable gates, structural evidence, reach, and semantic review.
 * Read-only. `ok` preserves the exit contract: no Doctor check failed. Skipped
 * checks can retain `ok: true`; read `assessment` for evidence and review limits.
 * @group Runtimes
 */
export interface DoctorResult {
  ok: boolean;
  gateVerdict: DoctorVerdict;
  /** @deprecated Gate-only alias for gateVerdict; not an adoption conclusion. */
  verdict: DoctorVerdict;
  assessment: AdoptionAssessment;
  workflowAssessments: AdoptionAssessment[];
  checks: DoctorCheck[];
  prohibitions?: ProhibitionEvidence[];
}

/** Run a read-only current-config adoption assessment. @group Runtimes */
export async function runDoctor(
  root: string,
  options: DoctorOptions = {},
): Promise<DoctorResult> {
  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);

  if (!state.hasConfig) {
    return noConfigResult(assessmentApplication(root, state), log, options.json);
  }

  const { blueprint } = await resolveBlueprint(root, state, options);

  const facts = collectArchitectureFacts(root, blueprint, {
    demand: 'application-scope', dependencies: state.dependencies,
    hasTypescript: state.hasTypescript, framework: state.framework,
  });

  const { scanResult } = facts;

  const { coverage } = facts;

  const { checks, probed, prohibitions } = await doctorChecks(
    root,
    { state, blueprint, scanResult, coverage, options, facts },
  );

  const ok = checks.every((check) => check.ok);
  const workflowAssessments = checks.flatMap((check) => check.assessment ? [check.assessment] : []);

  const assessment = assembleDoctorAssessment(root, state, {
    blueprint, facts, checks, prohibitions,
  });

  const notes = [
    unreachedIgnoreNote(scanResult, blueprint, probed),

    coverage.testExemption,
    uncommittedNote(state),
  ].filter((note) => note !== undefined);

  emit(log, checks, {
    notes, json: options.json, prohibitions, assessment, workflowAssessments,
    architectureFacts: {
      outsideScope: facts.outsideScope,
      governedWork: scanResult.governedWork,
      importAnalysis: facts.analysis,
      applicationScope: facts.findings
        .filter((finding) => finding.rule === 'uncovered-application-source')
        .map(({ rule, path, subject }) => ({ rule, path, subject })),
    },
  });

  return { ok, verdict: verdictOf(checks), gateVerdict: verdictOf(checks),
    assessment, workflowAssessments, checks, prohibitions };
}

async function doctorChecks(
  root: string,
  ctx: {
    state: ProjectState;
    blueprint: Blueprint;
    scanResult: ReturnType<typeof scan>;
    coverage: Coverage;
    options: DoctorOptions;
    facts: ArchitectureFacts;
  },
): Promise<{ checks: DoctorCheck[]; probed: boolean; prohibitions: ProhibitionEvidence[] }> {
  const { state, blueprint, scanResult, coverage, options, facts } = ctx;
  const eslintWired = state.ownedEslintConfig !== undefined || state.wiredEslintConfig;

  const { findings } = facts;

  const wiring = await wiringCheck({
    root,
    blueprint,
    scanResult,
    wired: eslintWired,

    merged: state.ownedEslintConfig === undefined,
    hasTypescript: state.hasTypescript,
    load: options.loadModule ?? loadProjectModule,
  });

  const lintDependencies = [...new Set(state.localPackage.dependencies
    .concat(state.toolchainPackage.dependencies))];

  const prohibitionWiring = await verifyProhibitions({
    root, blueprint, scanResult, wired: eslintWired,
    lintRoot: effectiveLintContext(root, state).lintRoot,
    detectedFramework: state.framework,
    load: options.loadModule ?? loadProjectModule,
  });

  const { assessment: lintAssessment, evidence: lintEvidence } = measureEffectiveLint({
    root, state, dependencies: lintDependencies, run: options.runLint,
  });

  const prohibitions = observedProhibitions(prohibitionWiring, lintEvidence, root);

  return {
    checks: [
      renderDoctorCheck({ kind: 'config', present: true }),
      ...transformationChecks(root, blueprint, { state, facts }),
      ...[renderOutsideScopeDoctorCheck(facts.outsideScope)]
        .filter((check) => check !== undefined),
      leftoversCheck(root, blueprint, !eslintWired && state.legacyEslintConfig !== undefined),
      eslintWiredCheck(state, eslintWired),
      lintEntrypointCheck(lintAssessment, effectiveLintIsAncestor(root, state)),
      liveLintCheck(lintEvidence, lintAssessment),
      ...aliasChecks(root, blueprint, state),
      wiring.check,
      ...prohibitionDoctorChecks(prohibitions),
      architectureCheck({
        baseline: assessmentBaseline(root, findings),
        coverage,
        blueprint,
        analysis: facts.analysis,
      }),
      ...[...new Set([root, state.eslintConfigRoot ?? root])]
        .map((ledgerRoot) => suppressionsCheck(ledgerRoot,
          path.relative(root, path.join(ledgerRoot, SUPPRESSIONS_FILE)).split(path.sep).join('/'))),
    ],
    probed: wiring.probed,
    prohibitions,
  };
}

export function measureEffectiveLint(input: {
  root: string;
  state: ProjectState;
  dependencies: string[];
  run?: typeof runLiveLint;
}) {
  const { root, state, dependencies } = input;
  const { ancestor, lintRoot, assessment, coversApplication } = effectiveLintContext(root, state);

  if (ancestor && !coversApplication) {
    return {
      assessment,
      evidence: {
        status: 'unverified' as const,
        command: assessment.eslint?.command ?? null,
        errors: 0,
        warnings: 0,
        reason: 'the ancestor ESLint entrypoint does not prove it targets this application while '
          + 'preserving the effective config and suppressions scope',
      },
    };
  }

  const run = assessment.reachable ? input.run ?? runLiveLint : runLiveLint;

  return { assessment, evidence: run(lintRoot, dependencies, assessment) };
}

export function effectiveLintContext(root: string, state: ProjectState) {
  const ancestor = effectiveLintIsAncestor(root, state);
  const lintRoot = ancestor ? state.eslintConfigRoot! : root;

  const assessment = assessLintEntrypoint(
    ancestor ? state.toolchainPackage : state.localPackage,
  );

  return {
    ancestor,
    lintRoot,
    assessment,
    coversApplication: !ancestor
      || ancestorLintCoversApplication(assessment, state.eslintBasePath),
  };
}

function effectiveLintIsAncestor(root: string, state: ProjectState): boolean {
  return state.eslintConfigRoot !== undefined
    && path.resolve(state.eslintConfigRoot) !== path.resolve(root);
}

export function ancestorLintCoversApplication(
  assessment: ReturnType<typeof assessLintEntrypoint>,
  basePath: string | undefined,
): boolean {
  const args = assessment.eslint?.args;

  if (!assessment.reachable || args === null || args === undefined || !basePath) {
    return false;
  }

  const normalizedBase = basePath.replaceAll('\\', '/').replace(/\/$/, '');

  return args.some((arg) => arg === '.'
    || normalizedBase === arg.replaceAll('\\', '/').replace(/\/$/, '')
    || normalizedBase.startsWith(`${arg.replaceAll('\\', '/').replace(/\/$/, '')}/`));
}

function transformationChecks(
  root: string,
  blueprint: Blueprint,
  input: { state: ProjectState; facts: ArchitectureFacts },
): DoctorCheck[] {
  const { state, facts } = input;
  let obligation;

  try {
    obligation = readTransformationObligation(root);
    assertTransformationAuthority(root, obligation);
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

  const verification = verifyTransformationObligation({
    root, obligation, blueprint, state, facts,
  });

  return [{ ...renderDoctorCheck({
    kind: 'transformation',
    status: 'pending',
    verified: verification.ok,
    failures: verification.failures,
  }), assessment: verification.assessment }];
}

function leftoversCheck(root: string, blueprint: Blueprint, legacy: boolean): DoctorCheck {
  const files = referenceFiles(root);

  const retained: string[] = legacy
    ? files.filter((file) => file === 'eslint.config.blueprint.mjs')
    : [];

  const references = files.filter((file) => !retained.includes(file));

  const authoring = [AUTHORING_FILE, COMMAND_FILE].filter((file) =>
    fs.existsSync(path.join(root, file)));

  const stale = staleContracts(root, blueprint);

  return renderDoctorCheck({ kind: 'leftovers', references, authoring, stale, retained });
}

function eslintWiredCheck(state: ProjectState, eslintWired: boolean): DoctorCheck {
  return renderDoctorCheck({
    kind: 'eslint-wired',
    wired: eslintWired,
    legacyConfig: state.legacyEslintConfig,
  });
}

export function lintEntrypointCheck(
  assessment: ReturnType<typeof assessLintEntrypoint>,
  ancestor: boolean,
): DoctorCheck {
  return assessment.reachable
    ? renderDoctorCheck({ kind: 'lint-entrypoint', reachable: true })
    : renderDoctorCheck({
        kind: 'lint-entrypoint',
        reachable: false,
        reason: assessment.reason === 'missing-lint'
          ? 'missing-lint'
          : ancestor && assessment.reason === 'eslint-opaque'
            ? 'opaque-ancestor'
            : 'unreachable',
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

function emit(
  log: (m: string) => void,
  checks: DoctorCheck[],
  report: {
    assessment: AdoptionAssessment;
    workflowAssessments?: AdoptionAssessment[];
    notes?: string[]; json?: boolean; prohibitions?: ProhibitionEvidence[];
    architectureFacts?: ArchitectureFactsView;
  },
): void {
  log(renderDoctorReport(checks, report));
}
