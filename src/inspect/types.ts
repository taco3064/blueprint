export type Severity = 'error' | 'warn' | 'info';

/** One architecture violation (or note) found in a project. */
export interface Finding {
  severity: Severity;
  /** Kebab-case rule id, e.g. `undeclared-folder`, `flow-violation`. */
  rule: string;
  /** File or directory the finding is about, relative to the project root. */
  path: string;
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
}
