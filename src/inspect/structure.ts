import { getFolderShape, getModuleEntry, normalizeAllowedImporters } from '../config';
import type { ArchitectureDef, ModuleDef, OwnedPackage, OwnedPrimitive } from '../config';
// The `nets` / `patterns` leaves, not the emit/lint index — the index also
// exports lint.ts, which loads the plugin, which shares resolve logic with
// inspect; routing through the index would close a module cycle.
import { netLabel } from '../emit/lint/nets';
import type { NetScope } from '../emit/lint/nets';
import type { PrimitiveOwner } from '../emit/lint/patterns';
import { packageGlobToRegExp } from './filter';
import { pathScope } from './resolve';
import type { Structure } from './resolve';
import { sourcePrefix } from './scan';
import type { Finding, ScanResult } from './types';

/**
 * What the tree holds, judged against what the blueprint declares — the folder
 * half of `analyze`. The import half reads references; this half reads names,
 * at both depths a modular structure has: the module folders at the source
 * root, and the declared layers nested inside each one.
 */

/** Everything the folder checks read, resolved once for the whole scan. */
interface StructureScope {
  scan: ScanResult;
  architecture: ArchitectureDef;
  structure: Structure;
  /**
   * The address prefix a directory finding carries — `scan`'s own, so a folder
   * and the files inside it are never spelled two different ways.
   */
  prefix: string;
  /** Directory names one level inside each layered module, keyed by module. */
  inside: Map<string, Set<string>>;
  dependencies?: string[];
}

/**
 * undeclared-folder, missing-module, missing-layer, declaratory-self-only,
 * no-entry and owns-not-installed, in that order — the order a reader meets
 * them in, outermost declaration first.
 */
export function structureFindings(
  scan: ScanResult,
  context: { architecture: ArchitectureDef; structure: Structure; dependencies?: string[] },
): Finding[] {
  const { architecture, structure, dependencies } = context;

  const scope: StructureScope = {
    scan,
    architecture,
    structure,
    prefix: sourcePrefix(architecture.sourceRoot),
    inside: new Map(
      structure.modules
        .filter((module) => module.layers !== false)
        .map((module) => [module.name, insideModule(scan, module.name)]),
    ),
    dependencies,
  };

  return [
    ...undeclaredFindings(scope),
    ...missingFindings(scope),
    ...declaratoryFindings(scope),
    ...entryFindings(scope),
    ...ownsFindings(scope),
  ];
}

/** Directory names one level inside a module — a file two segments deeper proves one. */
function insideModule(scan: ScanResult, module: string): Set<string> {
  return new Set(
    scan.files
      .filter((file) => file.segments[0] === module && file.segments.length >= 3)
      .map((file) => file.segments[1]),
  );
}

/**
 * Folders the blueprint does not declare, at whichever depth declares folders:
 * the layers under the flat structure, the modules at the source root under a
 * modular one, and — one level in — the layers nested inside a layered module.
 */
function undeclaredFindings(scope: StructureScope): Finding[] {
  const { scan, structure } = scope;

  const declared = structure.modules.length
    ? (dir: string): boolean => structure.modules.some((module) => module.name === dir)
    : structure.isLayer;

  const findings = scan.topDirs
    .filter((dir) => !declared(dir) && scan.files.some((file) => file.segments[0] === dir))
    .map((dir) => undeclared(scope, dir, topFolderMessage(scope, dir)));

  for (const [module, dirs] of scope.inside) {
    for (const dir of dirs) {
      if (!structure.isLayer(dir)) {
        findings.push(undeclared(scope, `${module}/${dir}`, layerFolderMessage(`${module}/${dir}`)));
      }
    }
  }

  return findings;
}

/**
 * The four directory findings are one-per-directory by construction, so the rule
 * and the path already identify them and there is nothing left to discriminate.
 * Empty subject rather than a repeat of the path: a subject that restates its
 * path says the finding has a second axis when it has not.
 */
function undeclared(scope: StructureScope, name: string, message: string): Finding {
  return { severity: 'error', rule: 'undeclared-folder', path: `${scope.prefix}${name}`, subject: '', message };
}

function layerFolderMessage(name: string): string {
  return `"${name}" is not a declared layer — declare it, or move its code into a folder of an existing layer.`;
}

/**
 * A declared layer's folder at the source root. "Declare it" — the flat
 * message's next step — is advice the config cannot take: `validateModuleName`
 * rejects a module named after a layer, so the code belongs one level in.
 *
 * The example names a module that keeps the shared layers. A `layers: false`
 * module is not one — nesting a layer folder inside it puts the code in the
 * module's single net, where that layer's own rules never arm — so when every
 * module opts out there is no destination to name and the fix is the opt-out
 * itself, the same "no net with a layer to hang it on" `rules` already reports.
 */
function layerAtRootMessage(scope: StructureScope, dir: string): string {
  const host = scope.structure.modules.find((module) => module.layers !== false);

  const move = host
    ? `so move its code there (e.g. "${host.name}/${dir}")`
    : `and every module here declares layers: false, so no module holds a "${dir}" folder at `
      + 'all — move the code into a module, and drop layers: false from the one that should '
      + 'carry the layers';

  return `"${dir}" is a declared layer, not a module — architecture.modules nests the layers `
    + `inside each module, ${move}. Declaring it as a module is not the fix: a module may not `
    + 'share a layer\'s name.';
}

/**
 * A top-level folder no declaration covers. Modular, the source root holds
 * modules, so a layer's own name sitting there is its own case.
 */
function topFolderMessage(scope: StructureScope, dir: string): string {
  const { structure } = scope;

  if (!structure.modules.length) {
    return layerFolderMessage(dir);
  }

  if (structure.isLayer(dir)) {
    return layerAtRootMessage(scope, dir);
  }

  return `"${dir}" is not a declared module — declare it in architecture.modules, or move its `
    + 'code into a folder of an existing module.';
}

/**
 * Declared, not built yet. Reads like a todo without the second clause — six of
 * these sent a field agent toward "delete the unused layers", the opposite of
 * the keep-is-default doctrine the playbook states (field run #13).
 */
function runwayNote(kind: 'layer' | 'module', name: string): string {
  return `Declared ${kind} "${name}" has no folder yet — runway, not a todo: `
    + 'the rules arm when code lands; keeping it is the default, '
    + 'slimming is the owner\'s call.';
}

/**
 * Declarations with no folder behind them yet. Modular, that question is asked
 * at the module depth first: a module with no folder at all says everything its
 * layers would, and repeating it once per declared layer is the same absence
 * counted `layers.length` times.
 */
function missingFindings(scope: StructureScope): Finding[] {
  const { scan, structure, prefix } = scope;

  const note = (kind: 'layer' | 'module', name: string, at: string): Finding => ({
    severity: 'info',
    rule: kind === 'module' ? 'missing-module' : 'missing-layer',
    path: `${prefix}${at}`,
    subject: '',
    message: runwayNote(kind, name),
  });

  if (!structure.modules.length) {
    return scope.architecture.layers
      .filter((layer) => !scan.topDirs.includes(layer.name))
      .map((layer) => note('layer', layer.name, layer.name));
  }

  return structure.modules.flatMap((module) =>
    scan.topDirs.includes(module.name)
      ? missingLayers(scope, module)
      : [note('module', module.name, module.name)]);
}

/** The layers a present module has no folder for — none at all for a `layers: false` one. */
function missingLayers(scope: StructureScope, module: ModuleDef): Finding[] {
  const dirs = scope.inside.get(module.name);

  if (!dirs) {
    return [];
  }

  return scope.architecture.layers
    .filter((layer) => !dirs.has(layer.name))
    .map((layer) => {
      const name = netLabel({ module: module.name, layer: layer.name });

      return {
        severity: 'info' as const,
        rule: 'missing-layer',
        path: `${scope.prefix}${name}`,
        subject: '',
        message: runwayNote('layer', name),
      };
    });
}

/**
 * Every net the emitted no-restricted-syntax entry for a selfOnly layer lands
 * on: the layer itself under the flat structure, and one per layered module
 * that has a folder. A module with no folder is `missing-module`'s to report —
 * asking about its layers is the same absence counted `layers.length` times.
 */
function selfOnlyNets(scope: StructureScope, layer: string): NetScope[] {
  const { scan, structure } = scope;

  return structure.modules.length
    ? [...scope.inside.keys()]
        .filter((module) => scan.topDirs.includes(module))
        .map((module) => ({ module, layer }))
    : [{ module: null, layer }];
}

/** One net's declaratory note, naming the net and its importers at that net's depth. */
function declaratory(prefix: string, net: NetScope, importers: string[]): Finding {
  const name = netLabel(net);
  const from = importers.map((importer) => netLabel({ ...net, layer: importer })).join(', ');

  return {
    severity: 'info',
    rule: 'declaratory-self-only',
    path: `${prefix}${name}`,
    subject: '',
    message: `selfOnly on "${name}" (importer(s): ${from}) is declaratory — the layer holds no files, so the re-export ban cannot fire yet; it arms once code lands. The no-restricted-syntax ENTRY is emitted today, on the importer layer(s) named above, so it is already exposed to a merge: IF a second no-restricted-syntax scoped to one of those layers exists, flat config merges neither into the other — the later entry replaces the earlier, silently, with lint still green. That condition is the whole note. Adopting into a single generated config, there is no second entry, so there is nothing here to act on. "Cannot fire" is about the ban, not about the entry. Check \`blueprint rules --json\` for the emit points before merging.`,
  };
}

/**
 * A selfOnly ban over a layer nobody inhabits is declaratory — info, because
 * intent declared early is not a defect (field batch 12). The note states the
 * collision as a CONDITION: it needs a second entry of that id, which inspect
 * cannot see, and read as unconditional it sends the single-config adopter
 * hunting a problem that requires a merge to exist (field batch 13).
 *
 * Asked once per net rather than once per layer, because that is where the
 * entry is emitted: modular, one declaration is armed in a module that has the
 * layer and blank in one that does not, and a single verdict over the repo is
 * wrong for one of them. The bare layer name is not an address there either —
 * it is the folder `undeclared-folder` tells a modular repo to move out of the
 * source root.
 *
 * A guard, not an empty list to iterate: on a scaffold every layer is a blank and
 * the coverage line already says so.
 */
function declaratoryFindings(scope: StructureScope): Finding[] {
  const { scan, architecture, structure, prefix } = scope;

  if (!scan.files.length) {
    return [];
  }

  const inhabited = new Set(
    scan.files
      .map((file) => pathScope(file.segments, structure))
      .filter((at) => at.layer !== null)
      .map(netLabel),
  );

  return architecture.layers.flatMap((layer) => {
    const importers = normalizeAllowedImporters(layer.allowedImporters)
      .filter((importer) => importer.selfOnly)
      .map((importer) => importer.layer);

    return importers.length
      ? selfOnlyNets(scope, layer.name)
          .filter((net) => !inhabited.has(netLabel(net)))
          .map((net) => declaratory(prefix, net, importers))
      : [];
  });
}

/** One feature folder's evidence: the layer it sits in, and its files' inner segments. */
interface FolderGroup {
  layer: string;
  files: string[][];
}

/**
 * Folders with no public entry, at both depths. A module's own entry is the one
 * point another module may reach it at (stage 2 emits that ban), so a module
 * without one is unreachable for the same reason a feature folder without one
 * is — the same sentence, one depth up.
 */
function entryFindings(scope: StructureScope): Finding[] {
  return [...moduleEntryFindings(scope), ...folderEntryFindings(scope)];
}

function moduleEntryFindings(scope: StructureScope): Finding[] {
  const { scan, architecture, structure, prefix } = scope;

  return structure.modules.flatMap((module) => {
    const files = scan.files.filter((file) => file.segments[0] === module.name);
    const entry = getModuleEntry(architecture, module.name);

    const has = files.some(
      (file) => file.segments.length === 2 && stripExt(file.segments[1]) === entry,
    );

    // An empty module folder is `missing-module`'s to report, not this check's.
    return !files.length || has
      ? []
      : [{
          severity: 'warn' as const,
          rule: 'no-entry',
          path: `${prefix}${module.name}`,
          subject: '',
          message: `Module "${module.name}" has no "${entry}" entry — nothing is importable from `
            + 'outside it; another module can reach it only there.',
        }];
  });
}

function folderEntryFindings(scope: StructureScope): Finding[] {
  const { architecture, prefix } = scope;

  return [...featureFolders(scope)].flatMap(([key, group]) => {
    const { entry } = getFolderShape(architecture, group.layer);

    const has = group.files.some(
      (inner) => inner.length === 3 && stripExt(inner[2]) === entry,
    );

    return has
      ? []
      : [{
          severity: 'warn' as const,
          rule: 'no-entry',
          path: `${prefix}${key}`,
          subject: '',
          message: `Folder "${key}" has no "${entry}" entry — nothing is importable from outside.`,
        }];
  });
}

/** Every folder-layout feature folder in the scan, keyed by the name a reader sees. */
function featureFolders(scope: StructureScope): Map<string, FolderGroup> {
  const { scan, architecture, structure } = scope;
  const folders = new Map<string, FolderGroup>();

  for (const file of scan.files) {
    const { module, layer, inner } = pathScope(file.segments, structure);

    if (layer === null || inner.length < 3
      || getFolderShape(architecture, layer).layout !== 'folder') {
      continue;
    }

    const key = `${netLabel({ module, layer })}/${inner[1]}`;
    const group = folders.get(key) ?? { layer, files: [] };

    group.files.push(inner);
    folders.set(key, group);
  }

  return folders;
}

/**
 * Anything that can own a primitive, paired with the noun its finding names it
 * by and the address that finding carries.
 *
 * A module's name maps 1:1 to one real folder, so its address is that folder. A
 * layer's name does not, once modules are declared: the layers live inside each
 * of them (`src/Alpha/views`, `src/Beta/views`), and `owns-not-installed`'s
 * remedy is in neither — it is `package.json`, or the declaration in
 * `blueprint.config.mjs`. So the layer half is the bare layer name, the
 * content-determined address `cycle` already gives its members, rather than one
 * of the real folders picked to look like a path. Picking one would send a
 * reader there to find nothing, and would move the baseline key
 * (`rule\0path\0subject`) whenever a module is added, renamed or reordered
 * without the underlying fact changing.
 */
function primitiveOwners(
  scope: StructureScope,
): { owner: PrimitiveOwner; kind: string; at: string }[] {
  return [
    ...scope.architecture.layers.map((owner) => ({ owner, kind: 'Layer', at: owner.name })),
    ...scope.structure.modules.map((owner) => ({
      owner,
      kind: 'Module',
      at: `${scope.prefix}${owner.name}`,
    })),
  ];
}

/**
 * Whether an owned package resolves at all. A `pattern: true` ownership names a
 * GROUP rather than a package, so any installed dependency the group reaches
 * satisfies it — read through the same matcher the emitted
 * `no-restricted-imports` group is matched by, so the note and the ban agree
 * about which dependencies count.
 */
function installed(owned: OwnedPackage, dependencies: string[]): boolean {
  return owned.pattern
    ? dependencies.some((dep) => packageGlobToRegExp(owned.package).test(dep))
    : dependencies.includes(owned.package);
}

/** The `owns` entry as a package, or null for a global — which has no install to check. */
function ownedPackage(owned: OwnedPrimitive): OwnedPackage | null {
  if (typeof owned === 'string') {
    return { package: owned };
  }

  return 'global' in owned ? null : owned;
}

/**
 * `owns` entries naming a package that is not installed. `info`, the same tier and
 * doctrine as `missing-layer`: declaring ownership before the install is the
 * legitimate order, so the ban is correct and simply has nothing to reach yet. A
 * global has no dependency list to answer to and is skipped.
 *
 * A pattern owner says the same thing in the two clauses where "the package"
 * would be a package nobody declared: it is the group that reaches nothing, and
 * installing anything under it resolves the note.
 */
function ownsFindings(scope: StructureScope): Finding[] {
  const { dependencies } = scope;

  if (!dependencies) {
    return [];
  }

  return primitiveOwners(scope).flatMap(({ owner, kind, at }) =>
    (owner.owns ?? []).flatMap((primitive) => {
      // Both forms answer the same question here: whether the package resolves at
      // all. A named import missing from an installed package is a different one.
      const owned = ownedPackage(primitive);

      if (owned === null || installed(owned, dependencies)) {
        return [];
      }

      const absence = owned.pattern
        ? 'which no dependency in package.json matches'
        : 'which is not in package.json';

      return [{
        severity: 'info' as const,
        rule: 'owns-not-installed',
        path: at,
        subject: owned.package,
        message: `${kind} "${owner.name}" owns "${owned.package}", ${absence} — `
          + 'runway, not a todo: the ban is emitted and correct, it just has nothing to '
          + `reach yet. Installing ${owned.pattern ? 'a package it reaches' : 'the package'} `
          + 'and dropping the declaration are both resolutions, and which one applies is '
          + 'the owner\'s call.',
      }];
    }));
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}
