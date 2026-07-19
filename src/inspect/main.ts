import { detect, resolveBlueprint } from '../project';
import type { ResolveOptions } from '../project';
import { analyze } from './analyze';
import { report } from './report';
import { scan } from './scan';
import type { Finding } from './types';

export interface InspectOptions extends ResolveOptions {
  /** Emit machine-readable JSON instead of the text report. */
  json?: boolean;
  /** Output sink (default `console.log`). */
  log?: (message: string) => void;
}

/**
 * Run `blueprint inspect` in `root`. Read-only: scans `src/`, checks it against
 * the resolved blueprint, and prints an Architecture Report. Returns the
 * findings and `ok` (false when any error-level finding exists).
 */
export async function runInspect(
  root: string,
  options: InspectOptions = {},
): Promise<{ findings: Finding[]; ok: boolean }> {
  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);
  const { blueprint } = await resolveBlueprint(root, state, options);
  const findings = analyze(scan(root), blueprint);
  const ok = !findings.some((finding) => finding.severity === 'error');

  log(options.json ? JSON.stringify({ ok, findings }, null, 2) : report(findings));

  return { findings, ok };
}
