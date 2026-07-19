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
 */
export async function runInspect(
  root: string,
  options: InspectOptions = {},
): Promise<{ findings: Finding[]; ok: boolean }> {
  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);
  const { blueprint } = await resolveBlueprint(root, state, options);
  const findings = analyze(scan(root), blueprint);
  const baselineFile = path.join(root, BASELINE_FILE);

  if (options.updateBaseline) {
    fs.writeFileSync(baselineFile, renderBaseline(findings));
    log(`Baseline updated — ${findings.length} finding(s) recorded in ${BASELINE_FILE}.`);

    return { findings, ok: true };
  }

  if (options.baseline) {
    if (!fs.existsSync(baselineFile)) {
      throw new Error(
        `${BASELINE_FILE} not found — run \`blueprint inspect --update-baseline\` first.`,
      );
    }

    const split = splitByBaseline(findings, parseBaseline(fs.readFileSync(baselineFile, 'utf-8')));
    const ok = !hasErrors(split.fresh);

    log(
      options.json
        ? JSON.stringify(
            { ok, findings: split.fresh, suppressed: split.suppressed, stale: split.stale },
            null,
            2,
          )
        : `${report(split.fresh)}\n\n${baselineSummary(split)}`,
    );

    return { findings: split.fresh, ok };
  }

  const ok = !hasErrors(findings);

  log(options.json ? JSON.stringify({ ok, findings }, null, 2) : report(findings));

  return { findings, ok };
}
