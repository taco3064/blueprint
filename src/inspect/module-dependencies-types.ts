export interface ObservedModuleEdge {
  from: string;
  to: string;
  references: number;
  evidence: { path: string; specifier: string }[];
  permission: 'direct' | 'transitive' | 'forbidden';
}

export interface ModuleDependencyUncertainty {
  cause: 'runtime-dependent-import' | 'parse-failure' | 'unresolved-project-reference';
  path: string;
  specifier?: string;
  detail?: string;
}

export interface ModuleDependencyRow {
  name: string;
  root: string;
  declaredDirect: string[];
  reachable: string[];
  observedDirect: ObservedModuleEdge[];
  matched: string[];
  missingDeclarations: string[];
  unusedDeclarations: string[];
  unverifiedDeclarations: string[];
  uncertainty: ModuleDependencyUncertainty[];
  reach: 'covered' | 'vacuous';
}

export interface ModuleDependencies {
  status: 'synchronized' | 'drift' | 'indeterminate' | 'runway';
  modules: ModuleDependencyRow[];
}

export interface ProjectReferenceFact {
  path: string;
  exists: boolean;
}
