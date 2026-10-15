import fs from 'node:fs';
import path from 'node:path';

import { detect, resolveBlueprint } from '../project';
import type { ResolveOptions } from '../project';
import type { AdoptionAssessment, Blueprint } from '../config';
import {
  CURRENT_CONFIG_ADOPTION_SCOPE,
  renderAssessmentText,
  renderAssessmentClaim,
  renderAssessmentNextStep, renderAssessmentOutput,
  renderModuleDependencyOutput,
  renderModuleDependencyDerivation,
  renderBaselineGateOutput,
  renderBaselineUpdate,
  renderImportGraphDerivation,
  renderScopeBaselineRefusal,
  renderOutsideScopeOutput,
  renderInspectOutput,
  renderInspectProhibitionOutput,
  renderTestExemptionOutput,
} from '../operational-contract';
import { collectArchitectureFacts } from './facts';
import type { ArchitectureFacts } from './facts';
import type { ModuleDependencies } from './module-dependencies-types';
import {
  BASELINE_FILE,
  baselineSummary,
  parseBaseline,
  renderBaseline,
  splitByBaseline,
} from './baseline';
import { renderCoverage } from './coverage';
import type { Coverage } from './coverage';
import { hasErrors, report } from './report';
import type { Finding } from './types';
import { assessmentApplication, inspectAssessmentBaseline } from './assessment-runtime';
import { deriveAdoptionAssessment } from './adoption-assessment';
import { architectureAssessmentItems } from './adoption-assessment-architecture';
import type { ProhibitionFact } from './prohibitions';

export interface InspectOptions extends ResolveOptions {
  /** Emit machine-readable JSON instead of the text report. */
  json?: boolean;
  /** Fail only on findings not recorded in the baseline (the brownfield ratchet). */
  baseline?: boolean;
  /** Record the current findings as the new baseline, then exit 0. */
  updateBaseline?: boolean;
  /** Output sink (default `console.log`). */
  log?: (message: string) => void;
}

/** Inspect gate results and unsuppressed repository-wide reconciliation facts. */
export interface InspectResult {
  assessment: AdoptionAssessment;
  findings: Finding[];
  ok: boolean;
  prohibitions: ProhibitionFact[];
  moduleDependencies: ModuleDependencies | null;
}

/**
 * Run `blueprint inspect` in `root`. Read-only (except `--update-baseline`):
 * scans the configured `architecture.sourceRoot`, checks it against the resolved
 * blueprint, and prints an Architecture Report. Returns the actionable findings and
 * `ok` — in baseline mode, `findings` holds only the fresh (non-baselined) ones.
 * @group Runtimes
 * @example
 * const { ok, findings } = await runInspect(process.cwd(), { baseline: true });
 *
 * process.exitCode = ok ? 0 : 1;
 */
export async function runInspect(
  root: string,
  options: InspectOptions = {},
): Promise<InspectResult> {
  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);
  const { blueprint } = await resolveBlueprint(root, state, options);

  const facts = inspectFacts(root, blueprint, state);

  const { scanResult, findings, coverage, analysis, prohibitions,
    scopeComplete, outsideScope, moduleDependencies } = facts;

  const baselineFile = path.join(root, BASELINE_FILE);

  const assess = () => {
    const baseline = inspectAssessmentBaseline(root, findings,
      options.baseline === true);

    const application = assessmentApplication(root, state);

    const items = architectureAssessmentItems({
      application, blueprint, facts,
      findings: baseline.fresh, suppressed: baseline.debt,
    });

    if (!options.baseline && !options.updateBaseline && hasErrors(baseline.debt)) {
      items.push({ id: 'inspect-baseline-policy', application, sourceKey: 'baseline-disabled',
        subject: BASELINE_FILE, lane: 'gate', status: 'failed', source: 'inspect-gate',
        claim: 'Current error findings fail Inspect when baseline mode is disabled.',
        evidence: baseline.debt, reach: null, limitations: [], signals: [],
        affectsExit: true, nextStep: null });
    }

    if (baseline.error !== null) {
      items.push({ id: 'baseline-evidence', application, sourceKey: BASELINE_FILE,
        subject: BASELINE_FILE, lane: 'gate', status: 'unverified', source: 'inspect-baseline',
        claim: renderAssessmentClaim('baseline-evidence'), evidence: { error: baseline.error },
        reach: null, limitations: [baseline.error], signals: [], affectsExit: false,
        nextStep: renderAssessmentNextStep('repair-baseline') });
    }

    return deriveAdoptionAssessment('current-config-adoption', items);
  };

  if (options.updateBaseline) {
    return updateInspectBaseline(baselineFile, facts, { ...options, log, assess });
  }

  const assessment = assess();

  if (options.baseline) {
    return { ...baselineGate(findings, baselineFile, {
      log, coverage, blueprint, scanResult, prohibitions, analysis, assessment,
      outsideScope, scopeComplete, moduleDependencies,
      json: options.json,
    }), prohibitions, moduleDependencies, assessment };
  }

  const ok = !hasErrors(findings) && analysis.status === 'healthy' && scopeComplete;

  log(
    options.json

      ? JSON.stringify({
          ok, assessment,
          scope: CURRENT_CONFIG_ADOPTION_SCOPE,
          findings,
          coverage,
          prohibitions,
          moduleDependencies,
          moduleDependencyDerivation: moduleDependencies === null
            ? null
            : renderModuleDependencyDerivation(),
          outsideScope,
          governedWork: scanResult.governedWork,
          importAnalysis: analysis,
          derivation: renderImportGraphDerivation(analysis),
        }, null, 2)
      : renderAssessmentOutput(assessment,
          renderModuleDependencyOutput(renderInspectProhibitionOutput(renderInspectOutput({
            architecture: report(findings, blueprint.architecture, {
              analysis, outsideScope: scanResult.outsideScope,
            }),
            coverage: renderCoverage(coverage, blueprint),
          }), prohibitions), moduleDependencies)),
  );

  return { findings, ok, prohibitions, moduleDependencies, assessment };
}

function inspectFacts(
  root: string,
  blueprint: Blueprint,
  state: ReturnType<typeof detect>,
) {
  return collectArchitectureFacts(root, blueprint, {
    demand: 'application-scope', dependencies: state.dependencies,
    hasTypescript: state.hasTypescript, framework: state.framework,
  });
}

function updateInspectBaseline(
  baselineFile: string, facts: ReturnType<typeof inspectFacts>,
  options: InspectOptions & { log: (message: string) => void; assess: () => AdoptionAssessment },
): InspectResult {
  const { findings, coverage, analysis, scopeComplete, outsideScope,
    prohibitions, moduleDependencies } = facts;

  const output: string[] = [];

  let result: { findings: Finding[]; ok: boolean };

  if (analysis.status !== 'healthy' || !scopeComplete) {
    output.push(renderScopeBaselineRefusal(analysis, outsideScope));
    result = { findings, ok: false };
  } else {
    result = lockBaseline(findings, baselineFile, { log: (line) => output.push(line), coverage });
  }

  const assessment = options.assess();

  if (options.json) {
    options.log(JSON.stringify({
      ...result, output, moduleDependencies, outsideScope, prohibitions, assessment,
    }, null, 2));
  } else {
    options.log(renderAssessmentText(assessment));

    const [first, ...rest] = output;

    options.log(renderModuleDependencyOutput(
      renderOutsideScopeOutput(first, outsideScope), moduleDependencies,
    ));

    rest.forEach((line) => options.log(renderOutsideScopeOutput(line, outsideScope)));
  }

  return { ...result, prohibitions, moduleDependencies, assessment };
}

function lockBaseline(
  findings: Finding[],
  baselineFile: string,
  ctx: { log: (message: string) => void; coverage: Coverage },
): { findings: Finding[]; ok: boolean } {
  const { log, coverage } = ctx;

  if (coverage.testExemption !== undefined) {
    log(renderTestExemptionOutput(coverage.testExemption));
  }

  const debt = findings.filter((finding) => finding.severity !== 'info');

  if (debt.length) {
    fs.writeFileSync(baselineFile, renderBaseline(debt));

    log(renderBaselineUpdate({
      debt: debt.length,
      // Stryker disable next-line ArithmeticOperator: renderer ignores it when debt is non-zero.
      informational: findings.length - debt.length,
      existed: fs.existsSync(baselineFile),
      file: BASELINE_FILE,
    }));

    return { findings, ok: true };
  }

  if (fs.existsSync(baselineFile)) {
    fs.rmSync(baselineFile);

    log(renderBaselineUpdate({
      debt: 0, informational: findings.length, existed: true, file: BASELINE_FILE,
    }));
  } else {
    log(renderBaselineUpdate({
      debt: 0, informational: findings.length, existed: false, file: BASELINE_FILE,
    }));
  }

  return { findings, ok: true };
}

function baselineGate(
  findings: Finding[],
  baselineFile: string,
  ctx: {
    log: (message: string) => void;
    assessment: AdoptionAssessment;
    coverage: Coverage;
    blueprint: Blueprint;
    scanResult: ArchitectureFacts['scanResult'];
    analysis: ArchitectureFacts['analysis'];
    outsideScope: ArchitectureFacts['outsideScope'];
    scopeComplete: boolean;
    prohibitions: ProhibitionFact[];
    moduleDependencies: ModuleDependencies | null;
    json?: boolean;
  },
): { findings: Finding[]; ok: boolean } {
  const { log, coverage, blueprint, scanResult, analysis, outsideScope, scopeComplete } = ctx;

  const recorded = fs.existsSync(baselineFile)
    ? parseBaseline(fs.readFileSync(baselineFile, 'utf-8'))
    : [];

  const split = splitByBaseline(findings, recorded);
  const ok = !hasErrors(split.fresh) && analysis.status === 'healthy' && scopeComplete;

  log(
    ctx.json
      ? JSON.stringify(
          {
            ok, assessment: ctx.assessment,
            scope: CURRENT_CONFIG_ADOPTION_SCOPE,
            findings: split.fresh,
            suppressed: split.suppressed,
            stale: split.stale,
            coverage,
            prohibitions: ctx.prohibitions,
            moduleDependencies: ctx.moduleDependencies,
            moduleDependencyDerivation: ctx.moduleDependencies === null
              ? null
              : renderModuleDependencyDerivation(),
            outsideScope,
            governedWork: scanResult.governedWork,
            importAnalysis: analysis,
            derivation: renderImportGraphDerivation(analysis),
          },
          null,
          2,
        )
      : renderAssessmentOutput(ctx.assessment,
          renderModuleDependencyOutput(renderInspectProhibitionOutput(renderBaselineGateOutput({
            architecture: report(split.fresh, blueprint.architecture, {
              analysis, outsideScope: scanResult.outsideScope,
            }),
            baseline: baselineSummary(split),
            coverage: renderCoverage(coverage, blueprint),
          }), ctx.prohibitions), ctx.moduleDependencies)),
  );

  return { findings: split.fresh, ok };
}
