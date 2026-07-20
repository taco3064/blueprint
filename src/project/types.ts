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
  /** `next` is a dependency — init uses the Next preset / authoring flow, not react. */
  hasNext: boolean;
  /** `nuxt` is a dependency — unsupported (auto-imports defeat static analysis). */
  hasNuxt: boolean;
  /** Detected Next route tree: `app` / `pages` / `both`, or null when unclear. */
  nextRouter: 'app' | 'pages' | 'both' | null;
  /** The Next route tree sits under `src/` (`create-next-app --src-dir`). */
  nextSrcDir: boolean;
  /**
   * The existing eslint config file carries the blueprint banner — it is
   * init's own output, safe to regenerate in place (undefined = hand-made).
   */
  ownedEslintConfig?: string;
  /**
   * A hand-maintained eslint config already imports `@kekkai/blueprint` —
   * its owner wired the rules in, so no reference file is needed.
   */
  wiredEslintConfig: boolean;
  /** Some `vite.config.*` is present. */
  hasViteConfig: boolean;
  /** The vite config file and its content, when present and readable. */
  viteConfig?: { file: string; text: string };
  /** `typescript` is a dependency. */
  hasTypescript: boolean;
  /** Contents of `tsconfig.json` / `tsconfig.app.json` / `jsconfig.json` (null = absent). */
  tsconfigs: Record<string, string | null>;
  /** Directory names already present under `src/`. */
  existingSrcDirs: string[];
  /** Required deps not yet installed. */
  missingDeps: string[];
}
