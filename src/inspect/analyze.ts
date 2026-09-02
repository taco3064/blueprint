import {
  getForbiddenLayers,
  getModuleShape,
  getSelfOnlyTargets,
  normalizeAllowedImporters,
} from '../config';
import type { AliasRoot, ArchitectureDef, Blueprint } from '../config';
import { dropTestFiles } from './filter';
import { compareText } from './order';
import {
  aliasList,
  buildModuleGraph,
  entryResolver,
  layoutResolver,
  relativeVerdict,
  resolveSegments,
  stripAlias,
} from './resolve';
import type { EntryOf, LayoutOf, ModuleShape } from './resolve';
import type { Finding, ImportRef, ScanResult, ScannedFile, Severity } from './types';

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

/**
 * The display prefix for a directory finding, from the config's source root — the
 * address an agent will actually go to. Per-file findings do not need it; `scan`
 * puts the prefix on `file.path` already.
 *
 * `'.'` yields an empty prefix, not `'./'`, so a project-root layout spells its
 * paths the same way here as `scan` does.
 */
function sourcePrefix(architecture: ArchitectureDef): string {
  const root = architecture.sourceRoot ?? 'src';

  return root === '.' ? '' : `${root}/`;
}

/**
 * Analyze a scan against a blueprint. Pure — the core of `inspect`.
 *
 * `dependencies` is the project's installed package names. Omitted means the
 * caller could not read them, which is not the same as none installed: the
 * `owns` check is skipped rather than reporting every declaration as absent.
 */
export function analyze(
  scan: ScanResult,
  blueprint: Blueprint,
  dependencies?: string[],
): Finding[] {
  const { architecture } = blueprint;
  const layerNames = architecture.layers.map((layer) => layer.name);

  // Symmetric with the lint side: test files are exempt from structure as far as the
  // globs reach.
  scan = dropTestFiles(scan, architecture.testFiles);

  const findings = [
    ...folderFindings(scan, architecture, layerNames),
    ...ownsFindings(architecture, dependencies),
    ...scan.files.flatMap((file) => importFindings(file, architecture, layerNames)),
  ];

  for (const cycle of detectCycles(buildModuleGraph(scan, architecture).edges)) {
    // The members, not the printed path: a cycle is a set of mutually dependent
    // modules, and `a → b → a` and `b → a → b` are one knot printed from two
    // starting points. Keyed on the path, the same knot read from a different entry
    // node is a different baseline entry. The address is the first member for the
    // same reason — content-determined, and always one of the modules in the message.
    const members = [...new Set(cycle)].sort(compareText);

    findings.push(
      finding('error', 'cycle', {
        path: members[0],
        subject: members.join(' '),
        message: `Import cycle between modules: ${cycle.join(' → ')}.`,
      }),
    );
  }

  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/**
 * `owns` entries naming a package that is not installed. `info`, the same tier and
 * doctrine as `missing-layer`: declaring ownership before the install is the
 * legitimate order, so the ban is correct and simply has nothing to reach yet. A
 * global has no dependency list to answer to and is skipped.
 */
function ownsFindings(
  architecture: ArchitectureDef,
  dependencies: string[] | undefined,
): Finding[] {
  if (!dependencies) {
    return [];
  }

  const findings: Finding[] = [];
  const prefix = sourcePrefix(architecture);

  for (const layer of architecture.layers) {
    for (const owned of layer.owns ?? []) {
      // Both forms answer the same question here: whether the package resolves at
      // all. A named import missing from an installed package is a different one.
      const pkg = typeof owned === 'string' ? owned : 'package' in owned ? owned.package : null;

      if (pkg === null || dependencies.includes(pkg)) {
        continue;
      }

      findings.push({
        severity: 'info',
        rule: 'owns-not-installed',
        path: `${prefix}${layer.name}`,
        subject: pkg,
        message: `Layer "${layer.name}" owns "${pkg}", which is not in package.json — `
          + 'runway, not a todo: the ban is emitted and correct, it just has nothing to '
          + 'reach yet. Installing the package and dropping the declaration are both '
          + 'resolutions, and which one applies is the owner\'s call.',
      });
    }
  }

  return findings;
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
        // The four directory findings are one-per-directory by construction, so the
        // rule and the path already identify them and there is nothing left to
        // discriminate. Empty rather than a repeat of the path: a subject that
        // restates its path says the finding has a second axis when it has not.
        subject: '',
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
        subject: '',
        // Reads like a todo without the second clause — six of these sent
        // a field agent toward "delete the unused layers", the opposite of
        // the keep-is-default doctrine the playbook states (field run #13).
        message: `Declared layer "${name}" has no folder yet — runway, not a todo: `
          + 'the rules arm when code lands; keeping it is the default, '
          + 'slimming is the owner\'s call.',
      });
    }
  }

  // A selfOnly ban over a layer nobody inhabits is declaratory — info, because
  // intent declared early is not a defect (field batch 12). The note states the
  // collision as a CONDITION: it needs a second entry of that id, which inspect
  // cannot see, and read as unconditional it sends the single-config adopter
  // hunting a problem that requires a merge to exist (field batch 13).
  //
  // A guard, not an empty list to iterate: on a scaffold every layer is a blank and
  // the coverage line already says so.
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
          subject: '',
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
        subject: '',
        message: `Module "${key}" has no "${entry}" entry — nothing is importable from outside.`,
      });
    }
  }

  return findings;
}

/** Everything a layer's imports are judged against, resolved once per file. */
interface ImportContext {
  architecture: ArchitectureDef;
  layerNames: string[];
  aliases: (AliasRoot | string)[];
  /** Layers this file's layer may not import. */
  forbidden: string[];
  /** Layers this file's layer may depend on but must not re-export. */
  selfOnly: string[];
  layoutOf: LayoutOf;
  entryOf: EntryOf;
}

/** Per-file import findings: deep-import, flow-violation, relative-escape, ownership, selfOnly. */
function importFindings(
  file: ScannedFile,
  architecture: ArchitectureDef,
  layerNames: string[],
): Finding[] {
  const fileLayer = file.segments[0];

  if (!layerNames.includes(fileLayer)) {
    return [];
  }

  const context: ImportContext = {
    architecture,
    layerNames,
    aliases: aliasList(architecture),
    forbidden: getForbiddenLayers(architecture, fileLayer),
    selfOnly: getSelfOnlyTargets(architecture, fileLayer),
    layoutOf: layoutResolver(architecture),
    entryOf: entryResolver(architecture),
  };

  return file.imports.flatMap((ref) => refFindings(file, ref, context));
}

/** One reference, routed by what it is: an alias path, a relative path, a package. */
function refFindings(file: ScannedFile, ref: ImportRef, context: ImportContext): Finding[] {
  const parts = stripAlias(ref.specifier, context.aliases);

  if (parts) {
    return aliasFindings(file, ref, { ...context, target: parts[0], depth: parts.length });
  }

  if (ref.specifier.startsWith('.')) {
    return relativeEscape(file, ref, context);
  }

  return packageFindings(file, ref, context);
}

/** An alias import into a declared layer: module depth, the flow ban, selfOnly re-export. */
function aliasFindings(
  file: ScannedFile,
  ref: ImportRef,
  context: ImportContext & { target: string; depth: number },
): Finding[] {
  const { target, depth, layerNames, layoutOf, forbidden, selfOnly } = context;
  const fileLayer = file.segments[0];

  if (!layerNames.includes(target)) {
    return [];
  }

  const findings: Finding[] = [];
  const at = { path: file.path, subject: ref.specifier };

  // Depth is judged against the *target* layer's layout — reaching inside
  // a folder-module layer is a violation wherever the import comes from.
  if (layoutOf(target) === 'folder' && depth >= 3) {
    findings.push(finding('error', 'deep-import', { ...at, message: `"${ref.specifier}" reaches inside a module — import it through its entry.` }));
  }

  if (target === fileLayer) {
    findings.push(finding('error', 'flow-violation', { ...at, message: `Same-layer import "${ref.specifier}" via the alias — use a relative path or extract to a lower layer.` }));
  } else if (forbidden.includes(target)) {
    findings.push(finding('error', 'flow-violation', { ...at, message: `"${fileLayer}" may not import "${target}" ("${ref.specifier}").` }));
  }

  if (ref.isExport && selfOnly.includes(target)) {
    findings.push(finding('error', 'selfonly-reexport', { ...at, message: `Re-exports "${target}" ("${ref.specifier}"), which is selfOnly — depend on it, do not re-export it.` }));
  }

  return findings;
}

/** A bare package import the blueprint gave to some other layer. */
function packageFindings(file: ScannedFile, ref: ImportRef, context: ImportContext): Finding[] {
  const fileLayer = file.segments[0];
  const owners = ownersOf(context.architecture, ref.specifier, ref.names);

  if (!owners || owners.includes(fileLayer)) {
    return [];
  }

  const named = ref.names.length ? ` (${ref.names.join(', ')})` : '';

  // The names are part of the subject, not just of the sentence: one file can
  // import two different restricted names from the same package, and those are
  // two debts with two fixes. Sorted, because `{ a, b }` and `{ b, a }` are the
  // same import written twice.
  const subject = ref.names.length
    ? `${ref.specifier} ${[...ref.names].sort(compareText).join(',')}`
    : ref.specifier;

  return [finding('error', 'package-ownership', {
    path: file.path,
    subject,
    message: `"${ref.specifier}"${named} is owned by ${owners.join(', ')} — not importable from "${fileLayer}".`,
  })];
}

/** A relative import, judged by the same verdict the embedded lint rule reads. */
function relativeEscape(file: ScannedFile, ref: ImportRef, shape: ModuleShape): Finding[] {
  const target = resolveSegments(file.segments.slice(0, -1), ref.specifier);
  const verdict = relativeVerdict(file.segments, target, shape);

  if (verdict === 'ok') {
    return [];
  }

  const at = { path: file.path, subject: ref.specifier };

  if (verdict === 'escapes-src') {
    return [finding('error', 'relative-escape', { ...at, message: `Relative import "${ref.specifier}" escapes src/ — use the project alias.` })];
  }

  if (verdict === 'reaches-inside') {
    return [finding('error', 'relative-escape', { ...at, message: `Relative import "${ref.specifier}" reaches past a sibling's entry — import "${shape.entryOf(file.segments[0])}" instead; what lives behind it is that module's own business.` })];
  }

  return [finding('error', 'relative-escape', { ...at, message: `Relative import "${ref.specifier}" leaves this layer — use the alias, or extract shared code to a lower layer.` })];
}

/** Owner layers of a package import (given its named imports), or null if unrestricted. */
function ownersOf(
  architecture: ArchitectureDef,
  specifier: string,
  names: string[],
): string[] | null {
  const owners: string[] = [];

  for (const layer of architecture.layers) {
    if (!layer.owns) {
      continue;
    }

    for (const owned of layer.owns) {
      if (typeof owned === 'string') {
        if (owned === specifier) {
          owners.push(layer.name);
        }
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
 * Every independent cycle in the graph, one representative path each.
 *
 * `detectCycle` returns on the first cycle it meets, and `analyze` reported that
 * one. Enforcement was unaffected — one cycle is enough to fail the gate — but the
 * report is also the brownfield debt inventory, and a repo with three unrelated
 * cycles was told it had one. "How many" and "whether any" are different questions
 * for anyone sizing the work, and this is the answer the tool can compute rather
 * than hedge with "there may be others".
 *
 * Not every *elementary* cycle: a graph's cycles can outnumber its nodes
 * exponentially, and a list like that is not an inventory either. One per strongly
 * connected component is the useful count — an SCC is a knot of mutual dependency
 * that has to be broken as a unit, and separate SCCs are separate pieces of work.
 *
 * Composed rather than reimplemented: Tarjan finds the components, then each
 * component's own edges go to `detectCycle` unchanged. That keeps the walk with the
 * memoization proof on it as the single cycle-finder, and it settles the self-loop
 * case for free — a one-node component answers null unless it really has an edge to
 * itself, so nothing here has to classify components as trivial or not.
 */
export function detectCycles(edges: Map<string, Set<string>>): string[][] {
  return stronglyConnected(edges)
    .map((component) => detectCycle(subgraph(edges, component)))
    .filter((cycle): cycle is string[] => cycle !== null)
    // Content-ordered, not traversal-ordered — Tarjan's output depends on its
    // starting key, and a report that reshuffles on an unrelated file is unreadable.
    .sort((a, b) => compareText(a[0], b[0]));
}

/**
 * One component's edges, dropping every target outside it, nodes in name order.
 *
 * The sort is what makes the representative path reproducible: `detectCycle` walks
 * from the first key it is given, so an unsorted subgraph would hand back whichever
 * cycle the insertion order happened to reach first.
 */
function subgraph(edges: Map<string, Set<string>>, component: string[]): Map<string, Set<string>> {
  const members = new Set(component);
  const restricted = new Map<string, Set<string>>();

  for (const node of [...component].sort(compareText)) {
    // undecidable, both halves, because only this component's nodes become keys: a
    // target the filter would have let through has no entry of its own, so it can
    // never close a cycle — true even with both changed at once. The filter stays
    // for the walk it avoids, the fallback because a leaf really has no entry.
    const targets = [...(edges.get(node) ?? [])].filter((target) => members.has(target));

    restricted.set(node, new Set(targets));
  }

  return restricted;
}

/**
 * Tarjan's strongly connected components, in the order the walk closes them.
 *
 * `lowest` is returned rather than mapped: the value a parent needs from a child IS
 * the child's lowlink, so the propagation is the signature. The component splices
 * off at the root's index, because popping until the root reappears needs an exit
 * branch Tarjan's own guarantee makes unreachable.
 */
function stronglyConnected(edges: Map<string, Set<string>>): string[][] {
  const index = new Map<string, number>();
  const onStack = new Set<string>();
  // undecidable: `splice(indexOf(node))` cuts at a found index, so a seeded entry
  // sits below every real one forever and never enters a component.
  const stack: string[] = [];
  const components: string[][] = [];
  let next = 0;

  /** `node` is a component root: everything above it on the stack is one knot. */
  const close = (node: string): void => {
    const component = stack.splice(stack.indexOf(node));

    for (const member of component) {
      onStack.delete(member);
    }

    components.push(component);
  };

  const visit = (node: string): number => {
    const own = next++;
    let lowest = own;

    index.set(node, own);
    stack.push(node);
    onStack.add(node);

    // undecidable, the `?? []` arm: a fabricated target closes as a one-node
    // component with no self-edge, so `detectCycle` drops it and `Math.min` against
    // its larger index is a no-op.
    for (const target of edges.get(node) ?? []) {
      const seen = index.get(target);

      if (seen === undefined) {
        lowest = Math.min(lowest, visit(target));
      } else if (onStack.has(target)) {
        // A target already indexed but off the stack belongs to a component that is
        // already closed — following it would merge two separate knots into one.
        lowest = Math.min(lowest, seen);
      }
    }

    if (lowest === own) {
      close(node);
    }

    return lowest;
  };

  for (const node of edges.keys()) {
    // Undecidable: re-entering an already-indexed node cannot change the answer. By
    // the time the loop reaches it, every target it has was indexed during its own
    // first visit and no component is open, so the re-visit pushes it, finds nothing
    // on the stack, and closes immediately as a one-node component — which
    // `detectCycles` then drops, since a lone node with no self-edge has no cycle. It
    // also re-indexes the node with a larger number, and that is unreadable too: an
    // index is only consulted for a target that is still `onStack`, and a re-visited
    // node is spliced off within the same call. Kept for the redundant walks it
    // avoids, not for the verdict.
    if (index.has(node)) {
      continue;
    }

    visit(node);
  }

  return components;
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
      if (stack.has(next)) {
        return [...path.slice(path.indexOf(next)), next];
      }

      if (!visited.has(next)) {
        const found = dfs(next, [...path, next]);

        if (found) {
          return found;
        }
      }
    }

    stack.delete(node);

    return null;
  };

  // undecidable: the inner `visited` check already stops a re-entered walk, so this
  // one shields nothing. The inner one is measured — a 40-node mesh times out.
  for (const node of edges.keys()) {
    if (!visited.has(node)) {
      const found = dfs(node, [node]);

      if (found) {
        return found;
      }
    }
  }

  return null;
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

/**
 * `path` and `subject` are both strings and both addresses, so they go in named —
 * swapping them positionally produced a finding nothing could be traced back to.
 */
function finding(
  severity: Severity,
  rule: string,
  about: { path: string; subject: string; message: string },
): Finding {
  return { severity, rule, ...about };
}
