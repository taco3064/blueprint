import { compareText } from './order';
import type { Finding } from './types';

/**
 * The brownfield ratchet: the baseline locks a legacy project's existing debt so CI
 * fails only on NEW findings, and shrinks as that debt is paid down.
 */

export const BASELINE_FILE = '.blueprint-baseline.json';

/**
 * The document version, bumped when identity moved off the message text. Older
 * entries carry no `subject`, so the reader refuses them by version and says how to
 * re-key rather than matching by message and keeping the failure alive.
 */
const BASELINE_VERSION = 2;

/** One recorded finding — kept as an object so baseline diffs read well. */
export interface BaselineEntry {
  rule: string;
  path: string;
  /** The stable discriminator inside `path` — see `Finding.subject`. */
  subject: string;
  /** Prose, recorded for whoever reads a diff — deliberately NOT part of the key. */
  message: string;
}

export interface BaselineSplit {
  /** Findings the baseline does not cover — the actionable set. */
  fresh: Finding[];
  /** Current findings suppressed by the baseline. */
  suppressed: number;
  /** Baseline entries that no longer occur — the ratchet can tighten. */
  stale: number;
}

/**
 * A finding's identity: its rule, where it is, and what inside there it is about.
 *
 * Not `message` — that is the one part of a finding whose purpose is to be
 * rewritten, and keying on it turned every rewording into a brownfield CI going red
 * on an upgrade that changed no code. `subject` takes its place rather than
 * nothing: one file holds several findings of the same rule.
 *
 * `\0` separates, the one byte that cannot occur in a rule id, a path or a
 * specifier. Written as the escape, so it survives a copy through any tool that
 * does not expect a control character in a template literal.
 */
function keyOf(entry: Omit<BaselineEntry, 'message'>): string {
  return `${entry.rule}\0${entry.path}\0${entry.subject}`;
}

/** Partition current findings against a recorded baseline. */
export function splitByBaseline(findings: Finding[], baseline: BaselineEntry[]): BaselineSplit {
  const allowed = new Set(baseline.map(keyOf));
  const fresh = findings.filter((finding) => !allowed.has(keyOf(finding)));
  const current = new Set(findings.map(keyOf));
  const stale = baseline.filter((entry) => !current.has(keyOf(entry))).length;

  return { fresh, suppressed: findings.length - fresh.length, stale };
}

/** Serialize findings into a sorted, dedup'd, diff-friendly baseline document. */
export function renderBaseline(findings: Finding[]): string {
  const byKey = new Map(
    findings.map((finding) => [
      keyOf(finding),
      {
        rule: finding.rule,
        path: finding.path,
        subject: finding.subject,
        // Read by nothing — it is here so a regenerated baseline's diff says which
        // finding each line is, and a rewording shows up as exactly that.
        message: finding.message,
      },
    ]),
  );

  const entries = [...byKey.entries()]
    .sort(([a], [b]) => compareText(a, b))
    .map(([, entry]) => entry);

  return `${JSON.stringify({ version: BASELINE_VERSION, findings: entries }, null, 2)}\n`;
}

/** Parse and shape-check a baseline document. */
export function parseBaseline(text: string): BaselineEntry[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Baseline file is not valid JSON — regenerate it with --update-baseline.');
  }

  // undecidable, the `parsed !== null` half: the only value passing `typeof` and
  // failing this is `null`, which is what the false branch assigns anyway. It stays
  // for the narrowing that makes the cast below legal.
  const document = typeof parsed === 'object' && parsed !== null
    ? (parsed as { findings?: unknown; version?: unknown })
    : null;

  const entries = document !== null && 'findings' in document ? document.findings : null;

  // Refused rather than migrated, and named as an upgrade rather than as corruption.
  // A v1 file's entries are keyed on the message text, so reading one under the new
  // key would silently suppress nothing and report the whole ledger as fresh — the
  // wall of red the baseline exists to prevent, arriving with no stated cause. The
  // remedy is one command and loses nothing: the findings are still in the repo.
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
      // No `typeof entry !== 'object'` in front: the property checks below reject
      // every non-object JSON can produce (a string has no `.rule`, an array has no
      // `.rule`), so it could only ever agree with them — and the null check is the
      // one that has to come first, because it is what stops the property reads
      // from throwing.
      (entry: unknown) =>
        entry === null
        || typeof (entry as BaselineEntry).rule !== 'string'
        || typeof (entry as BaselineEntry).path !== 'string'
        || typeof (entry as BaselineEntry).subject !== 'string'
        || typeof (entry as BaselineEntry).message !== 'string',
    )
  ) {
    throw new Error('Baseline file has an unexpected shape — '
      + 'regenerate it with --update-baseline.');
  }

  return entries as BaselineEntry[];
}

/** The two ratchet status lines appended to a baselined report. */
export function baselineSummary(split: BaselineSplit): string {
  const lines = [`${split.suppressed} baselined finding(s) suppressed.`];

  if (split.stale > 0) {
    lines.push(
      `${split.stale} baseline entr${split.stale === 1 ? 'y' : 'ies'} no longer occur — run --update-baseline to tighten the ratchet.`,
    );
  }

  return lines.join('\n');
}
