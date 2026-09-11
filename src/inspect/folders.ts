import { resolveArchitecture } from '../config';
import type { ArchitectureDef } from '../config';
import type { Finding, ScanResult, ScannedFile } from './types';

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
      message: `"${dir}" is not a declared ${subject} — move its code into an existing ${subject}, `
        + 'or ask the owner to update the architecture contract.',
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

    return file.segments.length > 2 && modules.has(module) && position === null
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
      message: `"${layer}" is not a declared layer inside module "${module}" — move its code `
        + 'into an existing layer, or ask the owner to update the shared layer contract.',
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
    message: `Declared ${subject} "${name}" has no folder yet — runway, not a todo: `
      + 'the rules arm when code lands; keeping it is the default, '
      + 'slimming is the owner\'s call.',
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
          message: selfOnlyMessage(position.layer.name, importers),
        }]
      : [];
  });
}

function selfOnlyMessage(layer: string, importers: string[]): string {
  return `selfOnly on "${layer}" (importer(s): ${importers.join(', ')}) is declaratory — `
    + 'the layer holds no files, so the re-export ban cannot fire yet; it arms once code '
    + 'lands. The no-restricted-syntax ENTRY is emitted today, on the importer layer(s) '
    + 'named above, so it is already exposed to a merge: IF a second '
    + 'no-restricted-syntax scoped to one of those layers exists, flat config merges '
    + 'neither into the other — the later entry replaces the earlier, silently, with lint '
    + 'still green. That condition is the whole note. Adopting into a single generated '
    + 'config, there is no second entry, so there is nothing here to act on. "Cannot fire" '
    + 'is about the ban, not about the entry. Check `blueprint rules --json` for the emit '
    + 'points before merging.';
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

    return hasEntry
      ? []
      : [{
          severity: 'warn',
          rule: 'no-entry',
          path: `${prefix}${key}`,
          subject: '',
          message: `Unit "${key}" has no "${entry}" entry — nothing is importable from outside.`,
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
