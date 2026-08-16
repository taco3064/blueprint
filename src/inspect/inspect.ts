import fs from 'node:fs';
import path from 'node:path';

import { detect, resolveBlueprint } from '../project';
import type { ResolveOptions } from '../project';
import type { Blueprint } from '../config';
import { analyze } from './analyze';
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
import { importGraphDerivation, scan } from './scan';
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
  const findings = analyze(scanResult, blueprint, state.dependencies);
  const coverage = computeCoverage(scanResult, blueprint, state.hasTypescript);
  const baselineFile = path.join(root, BASELINE_FILE);

  if (options.updateBaseline) {
    return lockBaseline(findings, baselineFile, log);
  }

  if (options.baseline) {
    return baselineGate(findings, baselineFile, { log, coverage, blueprint, json: options.json });
  }

  const ok = !hasErrors(findings);

  log(
    options.json
      // The `--json` reader gets the derivation too: `ok: true` is a verdict on what
      // a text scan could see, and JSON is the whole channel for whoever parses it.
      ? JSON.stringify({ ok, findings, coverage, derivation: importGraphDerivation() }, null, 2)
      : `${report(findings)}\n\n${renderCoverage(coverage, blueprint)}`,
  );

  return { findings, ok };
}

/** `--update-baseline`: record today's debt, or retire a ledger that is paid off. */
function lockBaseline(
  findings: Finding[],
  baselineFile: string,
  log: (message: string) => void,
): { findings: Finding[]; ok: boolean } {
  // Info findings are not debt — "not built yet" is nothing a ratchet should hold,
  // and recording them invites manufacturing debt just to have something to lock.
  const debt = findings.filter((finding) => finding.severity !== 'info');

  if (debt.length) {
    fs.writeFileSync(baselineFile, renderBaseline(debt));
    log(`Baseline updated — ${debt.length} finding(s) recorded in ${BASELINE_FILE}.`);

    return { findings, ok: true };
  }

  // A clean repo needs no ratchet — an empty baseline is a file whose only
  // job is to exist. Skip writing it, and retire a paid-off one.
  const note = findings.length
    ? ` (${findings.length} informational note(s) are not debt)`
    : '';

  // Never point at plain `inspect` here — the gate line is
  // `inspect --baseline` (a missing ledger is an empty one), and telling
  // the reader plain inspect is the gate invites them to "fix" that line.
  if (fs.existsSync(baselineFile)) {
    fs.rmSync(baselineFile);
    log(`No debt to lock${note} — ${BASELINE_FILE} removed; \`inspect --baseline\` (the gate line) now suppresses nothing.`);
  } else {
    log(`No debt to lock${note} — no baseline needed; \`inspect --baseline\` (the gate line) treats a missing ledger as empty.`);
  }

  return { findings, ok: true };
}

/**
 * `--baseline`: the gate line. A missing baseline file is an empty baseline, so
 * every finding is fresh — which keeps one uniform command on repos with and
 * without recorded debt.
 */
function baselineGate(
  findings: Finding[],
  baselineFile: string,
  ctx: {
    log: (message: string) => void;
    coverage: Coverage;
    blueprint: Blueprint;
    json?: boolean;
  },
): { findings: Finding[]; ok: boolean } {
  const { log, coverage, blueprint } = ctx;

  const recorded = fs.existsSync(baselineFile)
    ? parseBaseline(fs.readFileSync(baselineFile, 'utf-8'))
    : [];

  const split = splitByBaseline(findings, recorded);
  const ok = !hasErrors(split.fresh);

  log(
    ctx.json
      ? JSON.stringify(
          {
            ok,
            findings: split.fresh,
            suppressed: split.suppressed,
            stale: split.stale,
            coverage,
            derivation: importGraphDerivation(),
          },
          null,
          2,
        )
      : `${report(split.fresh)}\n\n${baselineSummary(split)}\n${renderCoverage(coverage, blueprint)}`,
  );

  return { findings: split.fresh, ok };
}
