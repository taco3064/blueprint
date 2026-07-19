import type { Framework } from '../config/types';

export type PackageManager = 'pnpm' | 'yarn' | 'npm';

/** Facts read from the target project — the input to the (pure) planner. */
export interface ProjectState {
  root: string;
  /** Detected from dependencies; null when ambiguous or absent. */
  framework: Framework | null;
  packageManager: PackageManager;
  projectName?: string;
  /** `blueprint.config.mjs` is present. */
  hasConfig: boolean;
  /** Some `eslint.config.*` is present. */
  hasEslintConfig: boolean;
  /** Content of the existing CLAUDE.md, or null if absent. */
  claudeMd: string | null;
  /** Directory names already present under `src/`. */
  existingSrcDirs: string[];
  /** Required deps not yet installed. */
  missingDeps: string[];
}

/** A single filesystem / process effect the planner decided on. */
export type Action =
  | { kind: 'write'; path: string; content: string; note: string }
  | { kind: 'mkdir'; path: string; note: string }
  | { kind: 'install'; command: string; note: string }
  | { kind: 'instruct'; note: string };
