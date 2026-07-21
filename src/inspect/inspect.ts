import fs from 'node:fs';
import path from 'node:path';

import { detect, resolveBlueprint } from '../project';
import type { ResolveOptions } from '../project';
import { analyze } from './analyze';
import {
  BASELINE_FILE,
  baselineSummary,
  parseBaseline,
  renderBaseline,
  splitByBaseline,
} from './baseline';
import { computeCoverage, renderCoverage } from './coverage';
import { hasErrors, report } from './report';
import { scan } from './scan';
import type { Finding } from './types';

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
 * scans `src/`, checks it against the resolved blueprint, and prints an
 * Architecture Report. Returns the actionable findings and `ok` — in baseline
 * mode, `findings` holds only the fresh (non-baselined) ones.
 * @group Runtimes
 * @example
 * const { ok, findings } = await runInspect(process.cwd(), { baseline: true });
 *
 * process.exitCode = ok ? 0 : 1;
 */
export async function runInspect(
  root: string,
  options: InspectOptions = {},
): Promise<{ findings: Finding[]; ok: boolean }> {
  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);
  const { blueprint } = await resolveBlueprint(root, state, options);
  const scanResult = scan(root, blueprint.architecture.sourceRoot);
  const findings = analyze(scanResult, blueprint);
  const coverage = computeCoverage(scanResult, blueprint);
  const baselineFile = path.join(root, BASELINE_FILE);

  if (options.updateBaseline) {
    // The baseline is a debt ledger, and info findings are not debt — a
    // missing-layer note says "not built yet", nothing a ratchet should
    // hold. Recording them would also invite manufacturing debt on a clean
    // repo just to have something to lock.
    const debt = findings.filter((finding) => finding.severity !== 'info');

    // A clean repo needs no ratchet — an empty baseline is a file whose only
    // job is to exist. Skip writing it, and retire a paid-off one.
    if (!debt.length) {
      const note = findings.length
        ? ` (${findings.length} informational note(s) are not debt)`
        : '';

      if (fs.existsSync(baselineFile)) {
        fs.rmSync(baselineFile);
        log(`No debt to lock${note} — ${BASELINE_FILE} removed; plain \`blueprint inspect\` is the gate now.`);
      } else {
        log(`No debt to lock${note} — no baseline needed; plain \`blueprint inspect\` is the gate.`);
      }

      return { findings, ok: true };
    }

    fs.writeFileSync(baselineFile, renderBaseline(debt));
    log(`Baseline updated — ${debt.length} finding(s) recorded in ${BASELINE_FILE}.`);

    return { findings, ok: true };
  }

  if (options.baseline) {
    // A missing baseline file is an empty baseline: every finding is fresh.
    // This keeps `inspect --baseline` one uniform CI line on repos with and
    // without recorded debt.
    const recorded = fs.existsSync(baselineFile)
      ? parseBaseline(fs.readFileSync(baselineFile, 'utf-8'))
      : [];

    const split = splitByBaseline(findings, recorded);
    const ok = !hasErrors(split.fresh);

    log(
      options.json
        ? JSON.stringify(
            {
              ok,
              findings: split.fresh,
              suppressed: split.suppressed,
              stale: split.stale,
              coverage,
            },
            null,
            2,
          )
        : `${report(split.fresh)}\n\n${baselineSummary(split)}\n${renderCoverage(coverage)}`,
    );

    return { findings: split.fresh, ok };
  }

  const ok = !hasErrors(findings);

  log(
    options.json
      ? JSON.stringify({ ok, findings, coverage }, null, 2)
      : `${report(findings)}\n\n${renderCoverage(coverage)}`,
  );

  return { findings, ok };
}
