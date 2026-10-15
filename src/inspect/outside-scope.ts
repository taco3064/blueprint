import path from 'node:path';

import type { ResolvedArchitecture } from '../config';
import { globToRegExp } from '../config';
import { canonicalPath } from '../project';
import type { GitReader } from '../project';
import { isTestFile } from './filter';
import { outsideInventory } from './outside-inventory';
import type { OutsideInventory } from './outside-inventory';
import { unresolvedProjectReferences } from './outside-references';
import { readSourceFile } from './scan';
import type { OutsideScopeEvidence, ScanResult, ScannedFile } from './types';

export interface OutsideScopeOptions {
  git?: GitReader;
  readFile?: (root: string, file: string) => ScannedFile;
}

export function collectOutsideScope(
  root: string,
  resolved: ResolvedArchitecture,
  scan: ScanResult,
): OutsideScopeEvidence {
  return collectOutsideScopeWith(root, resolved, { scan });
}

export function collectOutsideScopeWith(
  root: string,
  resolved: ResolvedArchitecture,
  { scan, options = {} }: { scan: ScanResult; options?: OutsideScopeOptions },
): OutsideScopeEvidence {
  if (resolved.topology !== 'module-first') {
    return { status: 'not-applicable', reason: 'layer-first' };
  }

  if (resolved.sourceRoot === '.') {
    return { status: 'not-applicable', reason: 'source-root-is-application-root' };
  }

  const tests = resolved.testFiles.architectureExemptions.map(globToRegExp);
  const governed = { ...scan, files: scan.files.filter((file) => !isTestFile(file.path, tests)) };

  try {
    const inventory = outsideInventory(root, resolved, { scan: governed, git: options.git });

    return parseInventory(root, inventory, {
      governed, tests, options, aliases: resolved.aliasMappings,
    });
  } catch {
    return {
      status: 'unavailable', inventoryMode: 'none',
      reason: 'Outside-source inventory could not be collected.',
    };
  }
}

function fileLimitations(file: ScannedFile, governed = false): string[] {
  const limitations: string[] = [];

  if (file.importAnalysis?.parseError) {
    limitations.push(`${file.path}: ${governed ? 'governed import' : 'import'} parsing failed`);
  }

  if (file.importAnalysis?.unknownDynamicImports || file.unknownModuleSpecifiers) {
    limitations.push(`${file.path}: unresolved ${governed ? 'governed import' : 'import'} targets`);
  }

  return limitations;
}

function parseCandidates(
  root: string,
  candidates: string[],
  readFile: NonNullable<OutsideScopeOptions['readFile']>,
): { files: ScannedFile[]; limitations: string[]; readFiles: number } {
  const files: ScannedFile[] = [];
  const limitations: string[] = [];
  let readFiles = 0;

  for (const file of candidates) {
    try {
      const target = path.relative(canonicalPath(root), canonicalPath(path.join(root, file)));

      if (target === '..' || target.startsWith(`..${path.sep}`) || path.isAbsolute(target)) {
        limitations.push(`${file}: source resolves outside the application root`);

        continue;
      }

      readFiles++;
      const parsed = readFile(root, file);

      files.push(parsed);
      limitations.push(...fileLimitations(parsed));
    } catch {
      limitations.push(`${file}: source could not be read`);
    }
  }

  return { files, limitations, readFiles };
}

function parseInventory(
  root: string,
  inventory: OutsideInventory,
  { governed, tests, options, aliases }: {
    governed: ScanResult;
    tests: RegExp[];
    options: OutsideScopeOptions;
    aliases: [string, string][];
  },
): OutsideScopeEvidence {
  const candidates = inventory.files.filter((file) => !isTestFile(file, tests));
  const parsed = parseCandidates(root, candidates, options.readFile ?? readSourceFile);

  const limitations = [...governed.files.flatMap((file) => fileLimitations(file, true)),
    ...parsed.limitations,
    ...unresolvedProjectReferences(root, [...governed.files, ...parsed.files], aliases)];

  return {
    status: limitations.length ? 'partial' : 'complete',
    inventoryMode: inventory.mode,
    files: parsed.files,
    inventoryFiles: inventory.files.length,
    readFiles: parsed.readFiles,
    parsedFiles: parsed.files.length,
    directoryWalks: inventory.directoryWalks,
    testFilesExcluded: inventory.files.length - candidates.length,
    contributions: inventory.contributions,
    limitations,
    ...(inventory.fallbackReason ? { fallbackReason: inventory.fallbackReason } : {}),
  };
}
