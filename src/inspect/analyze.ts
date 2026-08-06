import { getForbiddenLayers, getModuleShape, getSelfOnlyTargets, normalizeAllowedImporters } from '../config';
import type { ArchitectureDef, Blueprint } from '../config';
import { dropTestFiles } from './filter';
import {
  aliasList,
  buildModuleGraph,
  entryResolver,
  layoutResolver,
  relativeVerdict,
  resolveSegments,
  stripAlias,
} from './resolve';
import type { EntryOf, LayoutOf } from './resolve';
import type { Finding, ImportRef, ScanResult, ScannedFile, Severity } from './types';

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

/**
 * The display prefix for a finding about a directory, from the source root the
 * config named.
 *
 * Per-file findings do not need this — `scan` already puts the prefix on
 * `file.path`. The directory-level findings built their path from a literal
 * `src/`, so a repo with `sourceRoot: 'app'` was told to look at `src/components`
 * for a folder that is at `app/components`. Enforcement was unaffected, which is
 * what let it live: the finding is correct, and only its address is wrong — in a
 * tool whose output is read by an agent that will go to that address.
 *
 * `'.'` yields an empty prefix, not `'./'`, so a project-root layout reads the same
 * way here as it does in `scan`'s own paths. Two spellings of one path in a single
 * report is a difference the reader has to rule out.
 */
function sourcePrefix(architecture: ArchitectureDef): string {
  const root = architecture.sourceRoot ?? 'src';

  return root === '.' ? '' : `${root}/`;
}

/** Analyze a scan against a blueprint. Pure — the core of `inspect`. */
export function analyze(scan: ScanResult, blueprint: Blueprint): Finding[] {
  const { architecture } = blueprint;
  const layerNames = architecture.layers.map((layer) => layer.name);

  // Symmetric with the lint side: test files are exempt from structure.
  scan = dropTestFiles(scan, architecture.testFiles);

  const findings = [
    ...folderFindings(scan, architecture, layerNames),
    ...scan.files.flatMap((file) => importFindings(file, architecture, layerNames)),
  ];

  const cycle = detectCycle(buildModuleGraph(scan, architecture).edges);

  if (cycle) {
    findings.push(
      finding('error', 'cycle', cycle[0], `Import cycle between modules: ${cycle.join(' → ')}.`),
    );
  }

  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** undeclared-folder, missing-layer, and no-entry findings. */
function folderFindings(
  scan: ScanResult,
  architecture: ArchitectureDef,
  layerNames: string[],
): Finding[] {
  const findings: Finding[] = [];
  const prefix = sourcePrefix(architecture);

  for (const dir of scan.topDirs) {
    if (!layerNames.includes(dir) && scan.files.some((file) => file.segments[0] === dir)) {
      findings.push({
        severity: 'error',
        rule: 'undeclared-folder',
        path: `${prefix}${dir}`,
        message: `"${dir}" is not a declared layer — declare it, or move its code into a module of an existing layer.`,
      });
    }
  }

  for (const name of layerNames) {
    if (!scan.topDirs.includes(name)) {
      findings.push({
        severity: 'info',
        rule: 'missing-layer',
        path: `${prefix}${name}`,
        // Reads like a todo without the second clause — six of these sent
        // a field agent toward "delete the unused layers", the opposite of
        // the keep-is-default doctrine the playbook states (field run #13).
        message: `Declared layer "${name}" has no folder yet — runway, not a todo: `
          + 'the rules arm when code lands; keeping it is the default, slimming is the owner\'s call.',
      });
    }
  }

  // A selfOnly ban protecting a layer nobody's code inhabits is declaratory:
  // the emitted re-export selector can never fire. Whoever is defusing that
  // rule's merge collision deserves to know the bomb is currently a blank
  // (field batch 12) — info, because intent declared early is not a defect.
  // The collision itself is conditional on a SECOND entry of that id, which
  // inspect cannot see, so the note names the condition rather than asserting
  // the collision: read as an unconditional "it collides today", an adopter on
  // the single-generated-config path goes hunting a problem that needs a merge
  // to exist (field batch 13).
  // Said as a guard, not as an empty list to iterate: on a scaffold with no code
  // every layer is a blank, and the coverage line already says so. Written as
  // `for (… of scan.files.length === 0 ? [] : layers)`, the empty arm decided
  // nothing measurable — a one-element list put in its place is discarded by the
  // body as the wrong shape, so the arm was never asked.
  if (scan.files.length > 0) {
    for (const layer of architecture.layers) {
      const selfOnlyImporters = normalizeAllowedImporters(layer.allowedImporters)
        .filter((importer) => importer.selfOnly)
        .map((importer) => importer.layer);

      if (selfOnlyImporters.length && !scan.files.some((file) => file.segments[0] === layer.name)) {
        findings.push({
          severity: 'info',
          rule: 'declaratory-self-only',
          path: `${prefix}${layer.name}`,
          message: `selfOnly on "${layer.name}" (importer(s): ${selfOnlyImporters.join(', ')}) is declaratory — the layer holds no files, so the re-export ban cannot fire yet; it arms once code lands. The no-restricted-syntax ENTRY is emitted today, on the importer layer(s) named above, so it is already exposed to a merge: IF a second no-restricted-syntax scoped to one of those layers exists, flat config merges neither into the other — the later entry replaces the earlier, silently, with lint still green. That condition is the whole note. Adopting into a single generated config, there is no second entry, so there is nothing here to act on. "Cannot fire" is about the ban, not about the entry. Check \`blueprint rules --json\` for the emit points before merging.`,
        });
      }
    }
  }

  findings.push(...noEntryFindings(scan, architecture, layerNames));

  return findings;
}

function noEntryFindings(
  scan: ScanResult,
  architecture: ArchitectureDef,
  layerNames: string[],
): Finding[] {
  const modules = new Map<string, ScannedFile[]>();

  for (const file of scan.files) {
    const layer = file.segments[0];

    if (
      file.segments.length >= 3
      && layerNames.includes(layer)
      && getModuleShape(architecture, layer).layout === 'folder'
    ) {
      const key = `${layer}/${file.segments[1]}`;

      modules.set(key, [...(modules.get(key) ?? []), file]);
    }
  }

  const findings: Finding[] = [];

  for (const [key, files] of modules) {
    const { entry } = getModuleShape(architecture, key.split('/')[0]);

    const hasEntry = files.some(
      (file) => file.segments.length === 3 && stripExt(file.segments[2]) === entry,
    );

    if (!hasEntry) {
      findings.push({
        severity: 'warn',
        rule: 'no-entry',
        path: `${sourcePrefix(architecture)}${key}`,
        message: `Module "${key}" has no "${entry}" entry — nothing is importable from outside.`,
      });
    }
  }

  return findings;
}

/** Per-file import findings: deep-import, flow-violation, relative-escape, ownership, selfOnly. */
function importFindings(
  file: ScannedFile,
  architecture: ArchitectureDef,
  layerNames: string[],
): Finding[] {
  const fileLayer = file.segments[0];

  if (!layerNames.includes(fileLayer)) return [];

  const aliases = aliasList(architecture);
  const forbidden = getForbiddenLayers(architecture, fileLayer);
  const selfOnly = getSelfOnlyTargets(architecture, fileLayer);
  const layoutOf = layoutResolver(architecture);
  const entryOf = entryResolver(architecture);
  const findings: Finding[] = [];

  for (const ref of file.imports) {
    const parts = stripAlias(ref.specifier, aliases);

    if (parts) {
      const target = parts[0];

      if (!layerNames.includes(target)) continue;

      // Depth is judged against the *target* layer's layout — reaching inside
      // a folder-module layer is a violation wherever the import comes from.
      if (layoutOf(target) === 'folder' && parts.length >= 3) {
        findings.push(finding('error', 'deep-import', file.path, `"${ref.specifier}" reaches inside a module — import it through its entry.`));
      }

      if (target === fileLayer) {
        findings.push(finding('error', 'flow-violation', file.path, `Same-layer import "${ref.specifier}" via the alias — use a relative path or extract to a lower layer.`));
      } else if (forbidden.includes(target)) {
        findings.push(finding('error', 'flow-violation', file.path, `"${fileLayer}" may not import "${target}" ("${ref.specifier}").`));
      }

      if (ref.isExport && selfOnly.includes(target)) {
        findings.push(finding('error', 'selfonly-reexport', file.path, `Re-exports "${target}" ("${ref.specifier}"), which is selfOnly — depend on it, do not re-export it.`));
      }
    } else if (ref.specifier.startsWith('.')) {
      const escape = relativeEscape(file, ref, layoutOf, entryOf);

      if (escape) findings.push(escape);
    } else {
      const owners = ownersOf(architecture, ref.specifier, ref.names);

      if (owners && !owners.includes(fileLayer)) {
        const named = ref.names.length ? ` (${ref.names.join(', ')})` : '';

        findings.push(finding('error', 'package-ownership', file.path, `"${ref.specifier}"${named} is owned by ${owners.join(', ')} — not importable from "${fileLayer}".`));
      }
    }
  }

  return findings;
}

function relativeEscape(
  file: ScannedFile,
  ref: ImportRef,
  layoutOf: LayoutOf,
  entryOf: EntryOf,
): Finding | null {
  const target = resolveSegments(file.segments.slice(0, -1), ref.specifier);
  const verdict = relativeVerdict(file.segments, target, layoutOf, entryOf);

  if (verdict === 'ok') return null;

  if (verdict === 'escapes-src') {
    return finding('error', 'relative-escape', file.path, `Relative import "${ref.specifier}" escapes src/ — use the project alias.`);
  }

  if (verdict === 'reaches-inside') {
    return finding('error', 'relative-escape', file.path, `Relative import "${ref.specifier}" reaches past a sibling's entry — import "${entryOf(file.segments[0])}" instead; what lives behind it is that module's own business.`);
  }

  return finding('error', 'relative-escape', file.path, `Relative import "${ref.specifier}" leaves this layer — use the alias, or extract shared code to a lower layer.`);
}

/** Owner layers of a package import (given its named imports), or null if unrestricted. */
function ownersOf(
  architecture: ArchitectureDef,
  specifier: string,
  names: string[],
): string[] | null {
  const owners: string[] = [];

  for (const layer of architecture.layers) {
    if (!layer.owns) continue;

    for (const owned of layer.owns) {
      if (typeof owned === 'string') {
        if (owned === specifier) owners.push(layer.name);
      } else if ('package' in owned && owned.package === specifier) {
        const restricted = owned.imports;

        if (!restricted?.length || names.some((name) => restricted.includes(name))) {
          owners.push(layer.name);
        }
      }
    }
  }

  return owners.length ? owners : null;
}

/**
 * Exported for its own tests. `visited` is memoization — `stack` is what detects
 * the cycle — so dropping it changes running time and never the answer, which makes
 * it invisible to any assertion about the RESULT. What it is not invisible to is a
 * graph whose paths outnumber its nodes: a 40-node mesh has ~102M distinct paths and
 * 40 memoized visits. Asked through `analyze`, that graph would be 40 fixture files;
 * asked here, it is a loop.
 */
export function detectCycle(edges: Map<string, Set<string>>): string[] | null {
  const visited = new Set<string>();
  const stack = new Set<string>();

  const dfs = (node: string, path: string[]): string[] | null => {
    visited.add(node);
    stack.add(node);

    for (const next of edges.get(node) ?? []) {
      if (stack.has(next)) return [...path.slice(path.indexOf(next)), next];

      if (!visited.has(next)) {
        const found = dfs(next, [...path, next]);

        if (found) return found;
      }
    }

    stack.delete(node);

    return null;
  };

  // Undecidable: the inner `visited` check keeps this one honest. Re-entering the
  // walk at an already-visited node recurses nowhere, because that check stops it —
  // so skipping the work and doing nothing cost the same. The inner one is measured
  // (a 40-node mesh times out without it); this one shields nothing further.
  for (const node of edges.keys()) {
    if (!visited.has(node)) {
      const found = dfs(node, [node]);

      if (found) return found;
    }
  }

  return null;
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

function finding(severity: Severity, rule: string, path: string, message: string): Finding {
  return { severity, rule, path, message };
}
