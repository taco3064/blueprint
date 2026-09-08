import { compareText } from './order';
import type { Finding } from './types';

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
    throw new Error('Baseline file is not valid JSON — regenerate it with --update-baseline.');
  }

  // Stryker disable next-line ConditionalExpression: primitives expose no findings either.
  const document = typeof parsed === 'object' && parsed !== null
    ? (parsed as { findings?: unknown; version?: unknown })
    : null;

  const entries = document !== null && 'findings' in document ? document.findings : null;

  if (document !== null && document.version !== BASELINE_VERSION) {
    throw new Error(
      `Baseline file is version ${JSON.stringify(document.version)}, and this blueprint writes `
      + `version ${BASELINE_VERSION} — regenerate it with --update-baseline. Older baselines `
      + 'identified a finding by its message text, so rewording one retired its entry and the '
      + 'same debt came back as new; entries are now keyed on the rule, the path and the '
      + 'subject, which a wording change does not touch. Re-keying records the same debt: '
      + 'nothing is suppressed that was not suppressed before.',
    );
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
    throw new Error(
      'Baseline file has an unexpected shape — regenerate it with --update-baseline.',
    );
  }

  return entries as BaselineEntry[];
}

export function baselineSummary(split: BaselineSplit): string {
  const lines = [`${split.suppressed} baselined finding(s) suppressed.`];

  if (split.stale > 0) {
    lines.push(
      `${split.stale} baseline entr${split.stale === 1 ? 'y' : 'ies'} no longer occur — run --update-baseline to tighten the ratchet.`,
    );
  }

  return lines.join('\n');
}
