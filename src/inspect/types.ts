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
   * members, `''` where `rule` and `path` already identify it on their own.
   *
   * This is the stable half of a finding's identity, and the baseline is keyed on
   * `rule` + `path` + `subject`. `message` is prose: it gets reworded as the tool
   * learns to explain itself better, and a ratchet keyed on prose turns red on
   * an upgrade that changed no violation. One file can hold several findings of
   * the same rule (two deep imports, two banned packages), which is why dropping
   * `message` from the key needs something in its place rather than nothing.
   */
  subject: string;
  message: string;
}

/** A single import/export/require reference extracted from a source file. */
export interface ImportRef {
  specifier: string;
  /** Named imports (import name before any `as`), empty for default/side-effect. */
  names: string[];
  /** True for `export ... from` (re-export) — used for the selfOnly check. */
  isExport: boolean;
}

/** A scanned source file: its path segments under `src/` and its imports. */
export interface ScannedFile {
  /** Path relative to the project root, e.g. `src/components/Button/Button.ts`. */
  path: string;
  /** Path segments relative to `src/`, e.g. `['components', 'Button', 'Button.ts']`. */
  segments: string[];
  imports: ImportRef[];
}

export interface ScanResult {
  /** Directory names directly under `src/`. */
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
   * Why the check could not run. `ok` stays true — a red nobody can appease is
   * worse than no check — but a skip is not a pass, and the banner used to count
   * it as one: a field agent read `✓ … (skipped — could not resolve the merged
   * config)` beside `✓ Adoption complete — all 7 checks passed.` and had to run
   * `impact`, the project's lint and `--print-config` to find out that the one
   * check proving the gates are wired had never run (field run #129). Structural
   * rather than a substring of `label`, so the banner and the JSON both see it.
   */
  skipped?: string;
}
