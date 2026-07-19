import type { Framework } from '../config';

export type PackageManager = 'pnpm' | 'yarn' | 'npm';

/** Facts read from a target project — the input to planning / analysis. */
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
  /** Some `vite.config.*` is present. */
  hasViteConfig: boolean;
  /** `typescript` is a dependency. */
  hasTypescript: boolean;
  /** Contents of `tsconfig.json` / `tsconfig.app.json` / `jsconfig.json` (null = absent). */
  tsconfigs: Record<string, string | null>;
  /** Directory names already present under `src/`. */
  existingSrcDirs: string[];
  /** Required deps not yet installed. */
  missingDeps: string[];
}
