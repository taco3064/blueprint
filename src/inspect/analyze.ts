import {
  getForbiddenLayers,
  getForbiddenModules,
  getModuleSelfOnlyTargets,
  getSelfOnlyTargets,
} from '../config';
import type { AliasRoot, ArchitectureDef, Blueprint } from '../config';
// The `bans` / `nets` / `patterns` leaves, not the emit/lint index — see
// `structure.ts`'s own note. Each of these three imports only `config` and its
// own siblings, so none of them reaches back into the plugin the index loads.
import { barredIn } from '../emit/lint/bans';
import { netLabel } from '../emit/lint/nets';
import { derivePackageRules, netIgnores, resolveTestFiles } from '../emit/lint/patterns';
import type { PackageRule } from '../emit/lint/types';
import { dropTestFiles, groupReaches, ignoresFile } from './filter';
import { compareText } from './order';
import {
  aliasList,
  buildModuleGraph,
  entryResolver,
  layoutResolver,
  modularVerdict,
  pathScope,
  relativeVerdict,
  resolveSegments,
  stripAlias,
  structureOf,
} from './resolve';
import type { EntryOf, LayoutOf, PathScope, Structure } from './resolve';
import { structureFindings } from './structure';
import type { Finding, ImportRef, ScanResult, ScannedFile, Severity } from './types';

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

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
  const structure = structureOf(architecture);

  // Symmetric with the lint side: test files are exempt from structure.
  scan = dropTestFiles(scan, architecture.testFiles);

  const analysis: AnalysisScope = {
    architecture,
    structure,
    testGlobs: resolveTestFiles(architecture.testFiles),
    // The emitted config's own restriction list, compiled from the same pair of
    // owner arrays `resolveBanScope` hands `derivePackageRules`.
    packageRules: derivePackageRules(
      [...architecture.layers, ...structure.modules],
      structure.modules.map((module) => module.name),
    ),
  };

  const findings = [
    ...structureFindings(scan, { architecture, structure, dependencies }),
    ...scan.files.flatMap((file) => importFindings(file, analysis)),
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

/** The blueprint facts every file is judged against, resolved once per scan. */
interface AnalysisScope {
  architecture: ArchitectureDef;
  structure: Structure;
  /** The test globs every emitted entry ignores, resolved once for the scan. */
  testGlobs: string[];
  /** Every package restriction the emitted config carries, in its own shape. */
  packageRules: PackageRule[];
}

/** Everything a file's imports are judged against, resolved once per file. */
interface ImportContext extends AnalysisScope {
  /** Where the importing file sits — its module, its layer, its inner segments. */
  scope: PathScope;
  aliases: (AliasRoot | string)[];
  /** Layers this file's layer may not import. */
  forbidden: string[];
  /** Layers this file's layer may depend on but must not re-export. */
  selfOnly: string[];
  /** Modules this file's module may not import. */
  forbiddenModules: string[];
  /** Modules this file's module may depend on but must not re-export. */
  moduleSelfOnly: string[];
  layoutOf: LayoutOf;
  entryOf: EntryOf;
}

/**
 * Per-file import findings: deep-import, flow-violation, relative-escape,
 * ownership, selfOnly.
 *
 * An ungoverned file is skipped, and which files those are is `pathScope`'s
 * answer, not a bare "is `segments[0]` a layer" — which under a modular
 * structure is false for EVERY file, so this returned nothing at all for a
 * whole repo while saying nothing about having done so.
 */
function importFindings(file: ScannedFile, analysis: AnalysisScope): Finding[] {
  const { architecture, structure } = analysis;
  const scope = pathScope(file.segments, structure);

  if (!scope.governed) {
    return [];
  }

  const { layer, module } = scope;

  const context: ImportContext = {
    ...analysis,
    scope,
    aliases: aliasList(architecture),
    forbidden: layer === null ? [] : getForbiddenLayers(architecture, layer),
    selfOnly: layer === null ? [] : getSelfOnlyTargets(architecture, layer),
    forbiddenModules: module === null ? [] : getForbiddenModules(architecture, module),
    moduleSelfOnly: module === null ? [] : getModuleSelfOnlyTargets(architecture, module),
    layoutOf: layoutResolver(architecture),
    entryOf: entryResolver(architecture),
  };

  return file.imports.flatMap((ref) => refFindings(file, ref, context));
}

/** One reference, routed by what it is: an alias path, a relative path, a package. */
function refFindings(file: ScannedFile, ref: ImportRef, context: ImportContext): Finding[] {
  const parts = stripAlias(ref.specifier, context.aliases);

  if (parts) {
    return context.structure.modules.length
      ? moduleAliasFindings(file, ref, { ...context, parts })
      : aliasFindings(file, ref, { ...context, target: parts[0], depth: parts.length });
  }

  if (ref.specifier.startsWith('.')) {
    return relativeEscape(file, ref, context);
  }

  return packageFindings(file, ref, context);
}

/**
 * An alias import under a modular structure, where `parts[0]` names a module and
 * never a layer — the same asymmetry `targetModuleKey` reads, because modules
 * and layers are never both governed dimensions for one segment.
 *
 * Its own module's name routes back into the layer model one segment in: the
 * module is stripped, so {@link aliasFindings} never learns modules exist and
 * the two structures cannot drift into two judgments.
 */
function moduleAliasFindings(
  file: ScannedFile,
  ref: ImportRef,
  context: ImportContext & { parts: string[] },
): Finding[] {
  const { parts, scope, structure } = context;
  const target = structure.modules.find((module) => module.name === parts[0]);

  if (!target) {
    return [];
  }

  if (target.name !== scope.module) {
    return crossModuleFindings(file, ref, { ...context, target: target.name });
  }

  const inner = parts.slice(1);

  // Inside a module the alias has exactly one legal spelling — the cross-layer
  // reach its own declared layers are addressed at (`~app/App/hooks`). Anything
  // else is the module reaching itself, which is what a relative path is for.
  return target.layers !== false && structure.isLayer(inner[0])
    ? aliasFindings(file, ref, { ...context, target: inner[0], depth: inner.length })
    : [finding('error', 'flow-violation', {
        path: file.path,
        subject: ref.specifier,
        message: `Same-module import "${ref.specifier}" via the alias — use a relative path; the alias is how a module is reached from outside it.`,
      })];
}

/** An alias import into another module: the module flow ban, entry-only depth, selfOnly. */
function crossModuleFindings(
  file: ScannedFile,
  ref: ImportRef,
  context: ImportContext & { parts: string[]; target: string },
): Finding[] {
  const { parts, target, scope, forbiddenModules, moduleSelfOnly } = context;
  const findings: Finding[] = [];
  const at = { path: file.path, subject: ref.specifier };

  if (forbiddenModules.includes(target)) {
    findings.push(finding('error', 'flow-violation', { ...at, message: `"${scope.module}" may not import module "${target}" ("${ref.specifier}") — a module may import only a module declared after it, unless that module's allowedImporters narrows it out.` }));
  } else if (parts.length >= 2) {
    // Only when the module is reachable at all: a module barred outright is
    // barred at both spellings and reported once, so a second finding for
    // reaching inside it would split one debt with one fix into two.
    findings.push(finding('error', 'deep-import', { ...at, message: `"${ref.specifier}" reaches inside module "${target}" — import the module through its entry.` }));
  }

  if (ref.isExport && moduleSelfOnly.includes(target)) {
    findings.push(finding('error', 'selfonly-reexport', { ...at, message: `Re-exports "${target}" ("${ref.specifier}"), which is selfOnly — depend on it, do not re-export it.` }));
  }

  return findings;
}

/** An alias import into a declared layer: folder depth, the flow ban, selfOnly re-export. */
function aliasFindings(
  file: ScannedFile,
  ref: ImportRef,
  context: ImportContext & { target: string; depth: number },
): Finding[] {
  const { target, depth, structure, layoutOf, forbidden, selfOnly } = context;
  const fileLayer = context.scope.layer;

  if (!structure.isLayer(target)) {
    return [];
  }

  const findings: Finding[] = [];
  const at = { path: file.path, subject: ref.specifier };

  // Depth is judged against the *target* layer's layout — reaching inside
  // a folder-layout layer is a violation wherever the import comes from.
  if (layoutOf(target) === 'folder' && depth >= 3) {
    findings.push(finding('error', 'deep-import', { ...at, message: `"${ref.specifier}" reaches inside a folder — import it through its entry.` }));
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

/**
 * A bare package import the blueprint gave to some other layer or module — one
 * finding per restriction that bars it, which is what the emitted config reports
 * too: `emitLint` writes one `no-restricted-imports` entry per RULE, so a file
 * importing two names one package's two owners split between them is two debts
 * with two fixes.
 *
 * Judged per restriction rather than per declaration, and against the compiled
 * list rather than raw `owns`. Aggregating the owners of everything matching the
 * specifier and passing the whole import when this net was among them let a layer
 * owning react's `createContext` also reach `useState` — which the emitted config
 * restricted, on a flat repo with no modules at all.
 */
function packageFindings(file: ScannedFile, ref: ImportRef, context: ImportContext): Finding[] {
  const { scope } = context;

  return activeRules(file, context).flatMap((rule) => {
    const names = restrictedNames(rule, ref);

    if (!reaches(rule, ref.specifier) || names === null) {
      return [];
    }

    const named = names.length ? ` (${names.join(', ')})` : '';

    // The names are part of the subject, not just of the sentence: one file can
    // import two different restricted names from the same package, and those are
    // two debts with two fixes. Sorted, because `{ a, b }` and `{ b, a }` are the
    // same import written twice.
    const subject = names.length
      ? `${ref.specifier} ${[...names].sort(compareText).join(',')}`
      : ref.specifier;

    return [finding('error', 'package-ownership', {
      path: file.path,
      subject,
      message: `"${ref.specifier}"${named} is owned by ${rule.allowedIn.join(', ')}`
        + ` — not importable from "${netLabel(scope)}".`,
    })];
  });
}

/**
 * The package restrictions in force on one file: the ones its net is barred from
 * — `barredIn`'s own either/or, a file may reach what its layer owns OR what its
 * module owns — minus every exempt-carrying one when the file matches an exempt
 * glob.
 *
 * The exemption is scoped to the NET rather than to the rule whose `exempt`
 * declared the glob, because that is the config `emitLint` writes: a net with any
 * exempt glob emits two entries, and a file matching one of them only ever
 * reaches the first, which carries the non-exempt restrictions alone. Flat config
 * replaces a rule rather than merging it, so this reach is the emitted behavior
 * itself and not an approximation of it.
 *
 * Read through the FILE matcher, because `exempt` is emitted as that entry's
 * `ignores` — a different grammar from the specifier globs below, and the two
 * are never compiled by one function here for the same reason ESLint does not
 * match them with one library. `netIgnores` hands over that entry's WHOLE list,
 * in order, exempt globs then test globs, because `ignores` is ordered and the
 * halves decide nothing apart: a `testFiles` negation re-includes a file the
 * exempt glob before it excluded, and reading the exempt half alone called such
 * a file exempt while ESLint linted it.
 */
function activeRules(file: ScannedFile, context: ImportContext): PackageRule[] {
  const barred = context.packageRules.filter((rule) => barredIn(context.scope, rule));
  const ignores = netIgnores(barred, context.testGlobs);

  return ignores && ignoresFile(ignores, file.path)
    ? barred.filter((rule) => !rule.exempt?.length)
    : barred;
}

/**
 * Whether a restriction reaches a specifier, in the two shapes
 * `buildPackagePatterns` splits them into: a `paths` entry matches the module
 * name exactly, a `patterns` entry goes to the rule's own group matcher.
 */
function reaches(rule: PackageRule, specifier: string): boolean {
  return rule.pattern ? groupReaches([rule.package], specifier) : rule.package === specifier;
}

/**
 * Which of a reference's names one restriction covers, or null when it narrows to
 * named imports and this reference brought none of them — the difference between
 * "owns the package outright" and "owns two of its exports".
 */
function restrictedNames(rule: PackageRule, ref: ImportRef): string[] | null {
  if (!rule.imports?.length) {
    return ref.names;
  }

  const covered = ref.names.filter((name) => rule.imports?.includes(name));

  return covered.length ? covered : null;
}

/**
 * A relative import, judged by the same verdict the embedded lint rule reads —
 * `modularVerdict` once modules are declared, exactly as `relative-escape.ts`
 * switches on its own `root` option. Two verdict functions for two structures,
 * never two implementations of one.
 */
function relativeEscape(file: ScannedFile, ref: ImportRef, context: ImportContext): Finding[] {
  const { structure, scope, layoutOf, entryOf } = context;
  const target = resolveSegments(file.segments.slice(0, -1), ref.specifier);
  const shape = { layoutOf, entryOf, isLayer: structure.isLayer };

  const verdict = structure.modules.length
    ? modularVerdict(file.segments, target, shape)
    : relativeVerdict(file.segments, target, shape);

  if (verdict === 'ok') {
    return [];
  }

  const at = { path: file.path, subject: ref.specifier };

  if (verdict === 'escapes-src') {
    return [finding('error', 'relative-escape', { ...at, message: `Relative import "${ref.specifier}" escapes src/ — use the project alias.` })];
  }

  if (verdict === 'leaves-module') {
    return [finding('error', 'relative-escape', { ...at, message: `Relative import "${ref.specifier}" leaves module "${scope.module}" — another module is reachable only at its entry, through the project alias, and only if that module allows this one to import it.` })];
  }

  if (verdict === 'reaches-inside') {
    return [finding('error', 'relative-escape', { ...at, message: `Relative import "${ref.specifier}" reaches past a sibling's entry — import "${entryOf(scope.inner[0])}" instead; what lives behind it is that folder's own business.` })];
  }

  return [finding('error', 'relative-escape', { ...at, message: `Relative import "${ref.specifier}" leaves this layer — use the alias, or extract shared code to a lower layer.` })];
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
