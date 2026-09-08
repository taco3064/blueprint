export type Severity = 'error' | 'warn' | 'info';

/** One architecture violation (or note) found in a project. */
export interface Finding {
  severity: Severity;
  /** Kebab-case rule id, e.g. `undeclared-folder`, `flow-violation`. */
  rule: string;
  /** File or directory the finding is about, relative to the project root. */
  path: string;
  /**
   * What inside `path` this finding is about — the import specifier, a cycle's
   * members, `''` where `rule` and `path` already identify it.
   *
   * The stable half of a finding's identity: the baseline keys on `rule` + `path` +
   * `subject`, never on `message`, which is prose that gets reworded.
   */
  subject: string;
  message: string;
}

export interface ImportRef {
  specifier: string;

  names: string[];

  isExport: boolean;
}

export interface ScannedFile {

  path: string;

  segments: string[];
  imports: ImportRef[];
}

export interface ScanResult {

  topDirs: string[];
  files: ScannedFile[];
}

/** One adoption-completeness check — the unit of the doctor report. */
export interface DoctorCheck {
  label: string;
  ok: boolean;
  /** What to do about it, when the check failed. */
  detail?: string;
  /**
   * Why the check could not run. `ok` stays true — a red nobody can appease is worse
   * than no check — but a skip is not a pass, and a banner counting it as one hid
   * that the wiring was never verified (field run #129). Structural rather than a
   * substring of `label`, so the banner and the JSON both see it.
   */
  skipped?: string;
}
