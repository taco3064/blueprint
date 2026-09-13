import { compareText } from './order';
import type { Finding } from './types';
import { renderBaselineError, renderBaselineSummary } from '../operational-contract';

export const BASELINE_FILE = '.blueprint-baseline.json';

const BASELINE_VERSION = 2;

export interface BaselineEntry {
  rule: string;
  path: string;

  subject: string;

  message: string;
}

export interface BaselineSplit {

  fresh: Finding[];

  suppressed: number;

  stale: number;
}

function keyOf(entry: Omit<BaselineEntry, 'message'>): string {
  return `${entry.rule}\0${entry.path}\0${entry.subject}`;
}

export function splitByBaseline(findings: Finding[], baseline: BaselineEntry[]): BaselineSplit {
  const allowed = new Set(baseline.map(keyOf));
  const fresh = findings.filter((finding) => !allowed.has(keyOf(finding)));
  const current = new Set(findings.map(keyOf));
  const stale = baseline.filter((entry) => !current.has(keyOf(entry))).length;

  return { fresh, suppressed: findings.length - fresh.length, stale };
}

export function renderBaseline(findings: Finding[]): string {
  const byKey = new Map(
    findings.map((finding) => [
      keyOf(finding),
      {
        rule: finding.rule,
        path: finding.path,
        subject: finding.subject,

        message: finding.message,
      },
    ]),
  );

  const entries = [...byKey.entries()]
    .sort(([a], [b]) => compareText(a, b))
    .map(([, entry]) => entry);

  return `${JSON.stringify({ version: BASELINE_VERSION, findings: entries }, null, 2)}\n`;
}

export function parseBaseline(text: string): BaselineEntry[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(renderBaselineError({ kind: 'invalid-json' }));
  }

  // Stryker disable next-line ConditionalExpression: primitives expose no findings either.
  const document = typeof parsed === 'object' && parsed !== null
    ? (parsed as { findings?: unknown; version?: unknown })
    : null;

  const entries = document !== null && 'findings' in document ? document.findings : null;

  if (document !== null && document.version !== BASELINE_VERSION) {
    throw new Error(renderBaselineError({
      kind: 'version', found: document.version, expected: BASELINE_VERSION,
    }));
  }

  if (
    !Array.isArray(entries)
    || entries.some(

      (entry: unknown) =>
        entry === null
        || typeof (entry as BaselineEntry).rule !== 'string'
        || typeof (entry as BaselineEntry).path !== 'string'
        || typeof (entry as BaselineEntry).subject !== 'string'
        || typeof (entry as BaselineEntry).message !== 'string',
    )
  ) {
    throw new Error(renderBaselineError({ kind: 'unexpected-shape' }));
  }

  return entries as BaselineEntry[];
}

export function baselineSummary(split: BaselineSplit): string {
  return renderBaselineSummary(split);
}
