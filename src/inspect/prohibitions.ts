import { resolveArchitecture } from '../config';
import { minimatch } from 'minimatch';
import type { Blueprint, Framework, ResolvedProhibition } from '../config';
import type { ScanResult } from './types';

export interface ProhibitionFact extends ResolvedProhibition {
  position: string;
  files: string[];
  ignores: string[];
  matchedFiles: string[];
  lintIntegration: 'verified' | 'unverified' | 'reference-only' | 'failed';
}

export function measureProhibitions(
  blueprint: Blueprint,
  scan: ScanResult,
  detectedFramework?: Framework | null,
): ProhibitionFact[] {
  const framework = blueprint.framework === 'auto'
    ? detectedFramework ?? 'auto'
    : blueprint.framework;

  const architecture = resolveArchitecture(blueprint.architecture, {
    framework,
    severity: blueprint.emit?.lint?.severity,
  });

  const ignores = [blueprint.architecture.layerFilesIgnore ?? []].flat()
    .concat(architecture.testFiles.architectureExemptions);

  const positions = architecture.layerPositions.map((position) => ({
    layer: position.layer,
    position: [position.module?.name, position.layer.name].filter(Boolean).join('/'),
    files: architecture.layerFiles(position.layer.name, blueprint.framework, position.module?.name),
    runway: false,
  }));

  if (architecture.moduleRunway) {
    positions.push(...architecture.layers.map((layer) => ({
      layer,
      position: `<module>/${layer.name}`,
      files: architecture.prohibitionFiles(layer.name, blueprint.framework),
      runway: true,
    })));
  }

  return positions.flatMap(({ layer, position, files, runway }) =>
    layer.prohibitions.map((prohibition) => {
      const excluded = [...ignores, ...prohibition.exempt];

      const matchedFiles = runway
        ? []
        : scan.files
            .filter((file) => files.some((net) => minimatch(file.path, net, { dot: true }))
              && !excluded.some((net) => minimatch(file.path, net, { dot: true })))
            .map((file) => file.path);

      return {
        ...prohibition,
        position,
        files,
        ignores,
        matchedFiles,
        reach: runway ? 'runway' : matchedFiles.length ? 'covered' : 'vacuous',
        lintIntegration: 'unverified',
      };
    }));
}
