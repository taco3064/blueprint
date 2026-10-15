import fs from 'node:fs';
import path from 'node:path';

import { detect, resolveBlueprint } from '../project';
import type { ResolveOptions } from '../project';
import type { Blueprint } from '../config';
import {
  CURRENT_CONFIG_ADOPTION_SCOPE,
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
import {
  BASELINE_FILE,
  baselineSummary,
  parseBaseline,
  renderBaseline,
  splitByBaseline,
} from './baseline';
import { computeCoverage, renderCoverage } from './coverage';
import type { Coverage } from './coverage';
import { hasErrors, report } from './report';
import type { Finding } from './types';
import { measureProhibitions } from './prohibitions';
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
): Promise<{ findings: Finding[]; ok: boolean; prohibitions: ProhibitionFact[] }> {
  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);
  const { blueprint } = await resolveBlueprint(root, state, options);

  const { scanResult, findings, coverage, analysis, prohibitions, scopeComplete, outsideScope }
    = inspectFacts(root, blueprint, state);

  const baselineFile = path.join(root, BASELINE_FILE);

  if (options.updateBaseline) {
    if (analysis.status !== 'healthy' || !scopeComplete) {
      log(renderScopeBaselineRefusal(analysis, outsideScope));

      return { findings, ok: false, prohibitions };
    }

    return { ...lockBaseline(findings, baselineFile, {
      log: (output) => log(renderOutsideScopeOutput(output, outsideScope)), coverage,
    }), prohibitions };
  }

  if (options.baseline) {
    return { ...baselineGate(findings, baselineFile, {
      log, coverage, blueprint, scanResult, prohibitions, analysis, outsideScope, scopeComplete,
      json: options.json,
    }), prohibitions };
  }

  const ok = !hasErrors(findings) && analysis.status === 'healthy' && scopeComplete;

  log(
    options.json

      ? JSON.stringify({
          ok,
          scope: CURRENT_CONFIG_ADOPTION_SCOPE,
          findings,
          coverage,
          prohibitions,
          outsideScope,
          governedWork: scanResult.governedWork,
          importAnalysis: analysis,
          derivation: renderImportGraphDerivation(analysis),
        }, null, 2)
      : renderInspectProhibitionOutput(renderInspectOutput({
          architecture: report(findings, blueprint.architecture, {
            analysis, outsideScope: scanResult.outsideScope,
          }),
          coverage: renderCoverage(coverage, blueprint),
        }), prohibitions),
  );

  return { findings, ok, prohibitions };
}

function inspectFacts(
  root: string,
  blueprint: Blueprint,
  state: ReturnType<typeof detect>,
) {
  const facts = collectArchitectureFacts(root, blueprint, {
    demand: 'application-scope', dependencies: state.dependencies,
  });

  const { scanResult } = facts;
  const coverage = computeCoverage(scanResult, blueprint, state.hasTypescript);

  return { ...facts, coverage,
    prohibitions: measureProhibitions(blueprint, scanResult, state.framework) };
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
    coverage: Coverage;
    blueprint: Blueprint;
    scanResult: ArchitectureFacts['scanResult'];
    analysis: ArchitectureFacts['analysis'];
    outsideScope: ArchitectureFacts['outsideScope'];
    scopeComplete: boolean;
    prohibitions: ProhibitionFact[];
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
            ok,
            scope: CURRENT_CONFIG_ADOPTION_SCOPE,
            findings: split.fresh,
            suppressed: split.suppressed,
            stale: split.stale,
            coverage,
            prohibitions: ctx.prohibitions,
            outsideScope,
            governedWork: scanResult.governedWork,
            importAnalysis: analysis,
            derivation: renderImportGraphDerivation(analysis),
          },
          null,
          2,
        )
      : renderInspectProhibitionOutput(renderBaselineGateOutput({
          architecture: report(split.fresh, blueprint.architecture, {
            analysis, outsideScope: scanResult.outsideScope,
          }),
          baseline: baselineSummary(split),
          coverage: renderCoverage(coverage, blueprint),
        }), ctx.prohibitions),
  );

  return { findings: split.fresh, ok };
}
