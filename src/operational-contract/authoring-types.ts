import type { Framework } from '../config';

export type AuthoringTopology = 'layer-first' | 'module-first';
export type FrameworkFact = Framework;

export interface AuthoringClaudeDirFact {
  hadDir: boolean;
  otherCommands: number;
  commandFile: string;
}

export interface ViteTsFact {
  verdict: 'covered' | 'outside';
  viteFile: string;
  tsconfig: string;
}

export interface TscArtifactFact {
  buildInfo: string;
  tsconfig: string;
}

export interface AuthoringVerdictFact {
  scopeRequired: boolean;
  totalFiles: number;
}

export interface AuthoringRuleCatalogFact {
  metricGates: { id: string; rule: string; fallback: number }[];
  pluginGates: { id: string; emits: string; note: string }[];
  documentationOnlyRules: { id: string; note: string }[];
}

export interface EslintConfigSourceFact {
  framework: Framework | null;
  hasTypescript: boolean;
  guardExtensions: string;
  sourceRoot: string;
  generatedBanner: string;
}
