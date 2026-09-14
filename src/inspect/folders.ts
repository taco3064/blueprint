import { resolveArchitecture } from '../config';
import type { ArchitectureDef } from '../config';
import type { Finding, ScanResult, ScannedFile } from './types';
import { renderFindingMessage } from '../operational-contract';

export function folderFindings(scan: ScanResult, architecture: ArchitectureDef): Finding[] {
  const resolved = resolveArchitecture(architecture);
  const prefix = resolved.sourceRoot === '.' ? '' : `${resolved.sourceRoot}/`;

  const topNames = resolved.topology === 'module-first'
    ? resolved.modules.map((module) => module.name)
    : resolved.layerNames;

  const subject = resolved.topology === 'module-first' ? 'module' : 'layer';

  return [
    ...undeclaredFindings(scan, { topNames, prefix, subject }),
    ...undeclaredInnerLayerFindings(scan, architecture, prefix),
    ...missingFindings(scan, {
      topNames, prefix, subject, topology: resolved.topology,
    }),
    ...selfOnlyFindings(scan, architecture),
    ...noEntryFindings(scan, architecture, prefix),
  ];
}

interface FolderScope {
  topNames: string[];
  prefix: string;
  subject: 'module' | 'layer';
}

function undeclaredFindings(scan: ScanResult, scope: FolderScope): Finding[] {
  const { topNames, prefix, subject } = scope;

  return scan.topDirs
    .filter((dir) => !topNames.includes(dir)
      && scan.files.some((file) => file.segments[0] === dir))
    .map((dir) => ({
      severity: 'error',
      rule: 'undeclared-folder',
      path: `${prefix}${dir}`,
      subject: '',
      message: renderFindingMessage({ kind: 'undeclared-folder', name: dir, subject }),
    }));
}

function undeclaredInnerLayerFindings(
  scan: ScanResult,
  architecture: ArchitectureDef,
  prefix: string,
): Finding[] {
  const resolved = resolveArchitecture(architecture);

  const modules = new Set(resolved.modules.map((module) => module.name));

  const positions = scan.files.flatMap((file) => {
    const [module, layer] = file.segments;
    const position = resolved.classify(file.segments);

    return modules.has(module) && position === null
      ? [`${module}/${layer}`]
      : [];
  });

  return [...new Set(positions)].map((position) => {
    const [module, layer] = position.split('/');

    return {
      severity: 'error',
      rule: 'undeclared-folder',
      path: `${prefix}${position}`,
      subject: '',
      message: renderFindingMessage({ kind: 'undeclared-inner-layer', layer, module }),
    };
  });
}

function missingFindings(scan: ScanResult, scope: FolderScope & {
  topology: 'layer-first' | 'module-first';
}): Finding[] {
  const { topNames, prefix, subject, topology } = scope;

  return topNames.filter((name) => !scan.topDirs.includes(name)).map((name) => ({
    severity: 'info',
    rule: topology === 'module-first' ? 'missing-module' : 'missing-layer',
    path: `${prefix}${name}`,
    subject: '',
    message: renderFindingMessage({ kind: 'missing-position', name, subject }),
  }));
}

function selfOnlyFindings(
  scan: ScanResult,
  architecture: ArchitectureDef,
): Finding[] {
  if (!scan.files.length) {
    return [];
  }

  const resolved = resolveArchitecture(architecture);

  return resolved.layerPositions.flatMap((position): Finding[] => {
    const importers = position.layer.allowedImporters
      .filter((importer) => importer.selfOnly)
      .map((importer) => importer.layer);

    const hasFiles = scan.files.some((file) => {
      const source = resolved.classify(file.segments);

      return source !== null && 'layer' in source
        && source.layer.name === position.layer.name
        && source.module?.name === position.module?.name;
    });

    return importers.length && !hasFiles
      ? [{
          severity: 'info',
          rule: 'declaratory-self-only',
          path: position.root,
          subject: '',
          message: renderFindingMessage({
            kind: 'declaratory-self-only', layer: position.layer.name, importers,
          }),
        }]
      : [];
  });
}

function noEntryFindings(
  scan: ScanResult,
  architecture: ArchitectureDef,
  prefix: string,
): Finding[] {
  const units = collectFolderUnits(scan, architecture);

  return [...units].flatMap(([key, { files, entry }]): Finding[] => {
    const depth = key.split('/').length;

    const hasEntry = files.some((file) => file.segments.length === depth + 1
      && stripExt(file.segments[file.segments.length - 1]) === entry);

    const directFile = files.find((file) => file.segments.length === depth)?.path;

    return hasEntry
      ? []
      : [{
          severity: 'warn',
          rule: 'no-entry',
          path: directFile ?? `${prefix}${key}`,
          subject: '',
          message: renderFindingMessage({ kind: 'no-entry', unit: key, entry, directFile }),
        }];
  });
}

function collectFolderUnits(
  scan: ScanResult,
  architecture: ArchitectureDef,
): Map<string, { files: ScannedFile[]; entry: string }> {
  const units = new Map<string, { files: ScannedFile[]; entry: string }>();
  const resolved = resolveArchitecture(architecture);

  for (const file of scan.files) {
    const position = resolved.classify(file.segments);

    if (position?.kind === 'unit' && position.layer.unit.layout === 'folder') {
      const key = [position.module?.name, position.layer.name, position.unit]
        .filter(Boolean)
        .join('/');

      const current = units.get(key);

      units.set(key, {
        files: [...(current?.files ?? []), file],
        entry: position.layer.unit.entry,
      });
    }
  }

  return units;
}

function stripExt(file: string): string {
  return file.replace(/\.[^.]+$/, '');
}
