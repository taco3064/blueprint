import { activeSetting, resolveArchitecture } from '../config';
import type { Blueprint, Framework, ResolvedArchitecture } from '../config';
import { analyze } from './analyze';
import { computeCoverage } from './coverage';
import type { Coverage } from './coverage';
import { measureProhibitions } from './prohibitions';
import type { ProhibitionFact } from './prohibitions';
import { collectOutsideScope } from './outside-scope';
import { importAnalysis, scan } from './scan';
import { dropTestFiles } from './filter';
import { importedPath } from './scope';
import { referenceExists } from './outside-references';
import { reconcileModuleDependencies } from './module-dependencies';
import { moduleDependencyFindings } from './module-dependencies-findings';
import type { ModuleDependencies, ProjectReferenceFact } from './module-dependencies-types';
import type { Finding, OutsideScopeEvidence, ScanResult, ScannedFile } from './types';

export type ArchitectureDemand = 'governed-source' | 'application-scope';

export interface ArchitectureFacts {
  coverage: Coverage;
  prohibitions: ProhibitionFact[];
  demand: ArchitectureDemand;
  governedFiles: ScannedFile[];
  projectReferences: Map<ScannedFile, Map<string, ProjectReferenceFact>>;
  moduleDependencies: ModuleDependencies | null;
  resolved: ResolvedArchitecture;
  scanResult: ScanResult;
  outsideScope: OutsideScopeEvidence;
  findings: Finding[];
  analysis: ReturnType<typeof importAnalysis>;
  scopeComplete: boolean;
}

export function collectArchitectureFacts(
  root: string,
  blueprint: Blueprint,
  options: { demand: ArchitectureDemand; dependencies?: string[];
    hasTypescript?: boolean; framework?: Framework | null; },
): ArchitectureFacts {
  const { demand } = options;
  const resolved = resolveArchitecture(blueprint.architecture);
  const scanResult = scan(root, resolved.sourceRoot);

  const outsideScope = demand === 'application-scope'
    ? collectOutsideScope(root, resolved, scanResult)
    : { status: 'not-requested' as const };

  scanResult.outsideScope = outsideScope;

  const outsideFiles = 'files' in outsideScope ? outsideScope.files : [];
  const analysis = importAnalysis({ ...scanResult, files: [...scanResult.files, ...outsideFiles] });

  const governedScan = dropTestFiles(scanResult, blueprint.architecture.testFiles);
  const governedFiles = governedScan.files;
  const projectReferences = collectProjectReferences(root, governedFiles, resolved);

  const moduleDependencies = reconcileModuleDependencies({
    resolved, governedFiles, projectReferences,
  });

  const tier = activeSetting(blueprint.rules?.moduleDependencySync)?.tier;

  return {
    demand,
    coverage: computeCoverage(scanResult, blueprint, options.hasTypescript ?? false),
    prohibitions: measureProhibitions(blueprint, scanResult, options.framework),
    governedFiles,
    projectReferences,
    moduleDependencies,
    resolved,
    scanResult,
    outsideScope,
    findings: [
      ...analyze(governedScan, blueprint, { ...options, resolved, testsFiltered: true }),
      ...moduleDependencyFindings(moduleDependencies, tier),
    ],
    analysis,
    scopeComplete: outsideScope.status === 'complete' || outsideScope.status === 'not-applicable',
  };
}

function collectProjectReferences(
  root: string, files: ScannedFile[], resolved: ResolvedArchitecture,
): Map<ScannedFile, Map<string, ProjectReferenceFact>> {
  return new Map(files.map((file) => {
    const references = new Map<string, ProjectReferenceFact>();

    for (const { specifier } of file.imports) {
      const target = importedPath(specifier, file.path, resolved.aliasMappings);

      if (target) {
        references.set(specifier, { path: target, exists: referenceExists(root, target) });
      }
    }

    return [file, references];
  }));
}
