import type { Framework } from '../config';

export type PackageManager = 'pnpm' | 'yarn' | 'npm';

export interface ProjectState {
  root: string;

  framework: Framework | null;
  packageManager: PackageManager;
  projectName?: string;

  hasConfig: boolean;

  hasEslintConfig: boolean;

  eslintConfigFile?: string;

  hasNext: boolean;

  hasNuxt: boolean;

  nextRouter: 'app' | 'pages' | 'both' | null;

  nextSrcDir: boolean;

  ownedEslintConfig?: string;

  wiredEslintConfig: boolean;

  legacyEslintConfig?: string;

  eslintConfigShape?: 'tseslint' | 'flat-array' | 'legacy';

  hasViteConfig: boolean;

  viteConfig?: { file: string; text: string };

  hasTypescript: boolean;

  tsconfigs: Record<string, string | null>;

  existingSrcDirs: string[];

  missingDeps: string[];

  dependencies: string[];
}
