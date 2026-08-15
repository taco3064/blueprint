import {
  DEFAULT_MODULE_SHAPE,
  getForbiddenLayers,
  getModuleShape,
  getSelfOnlyTargets,
  moduleDepth,
  normalizeAllowedImporters,
} from '../config';
import type { ArchitectureDef, Blueprint, ModuleDef, OwnedPrimitive } from '../config';
import { dropTestFiles } from './filter';
import { compareText } from './order';
import {
  addressesModuleRoot,
  crossModuleTarget,
  entryResolver,
  layoutResolver,
  relativeVerdict,
  resolveSegments,
  sourceRootName,
  stripAlias,
} from '../boundary';
import type { EntryOf, LayoutOf } from '../boundary';
import { aliasList, buildFolderGraph, buildModuleGraph } from './resolve';
import type { FolderGraph } from './resolve';
import { fileZone } from './zone';
import type { Finding, ImportRef, ScanResult, ScannedFile, Severity } from './types';

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

/** The directory layers live under, as the config spells it. */
function sourceRoot(architecture: ArchitectureDef): string {
  return architecture.sourceRoot ?? 'src';
}

/**
 * The display prefix for a directory finding, from the config's source root — the
 * address an agent will actually go to. Per-file findings do not need it; `scan`
 * puts the prefix on `file.path` already.
 *
 * `'.'` yields an empty prefix, not `'./'`, so a project-root layout spells its
 * paths the same way here as `scan` does.
 */
function sourcePrefix(architecture: ArchitectureDef): string {
  const root = sourceRoot(architecture);

  return root === '.' ? '' : `${root}/`;
}

/**
 * Where a finding about a LAYER is addressed, and the sentence that explains the
 * address when it is not the layer's own folder.
 *
 * A layer has a folder of its own only on a flat project. Under `modules` it sits
 * inside each declared module, so `${prefix}${name}` is not merely absent — a
 * top-level folder holding source is an undeclared module, so creating it to
 * satisfy the note trades an `info` for an `error` and governs nothing. The source
 * root is the one address that cannot be reached that way: `undeclared-module`
 * walks `scan.topDirs`, the directories INSIDE the source root, and the root is
 * never a member of its own listing.
 *
 * The path and its explanation come back together, from one place. A note
 * addressed away from the thing it names reads as breakage without the reason, and
 * both findings that address a layer need the same reason — written twice it
 * becomes two paraphrases that drift, which is the shape `printConfigCaveats` was
 * extracted from.
 */
function layerAddress(architecture: ArchitectureDef, name: string): { path: string; note: string } {
  const prefix = sourcePrefix(architecture);
  const own = `${prefix}${name}`;

  if (architecture.modules === undefined) return { path: own, note: '' };

  return {
    path: sourceRoot(architecture),
    note: ` This project declares \`modules\`, so "${name}" is a layer inside each one rather than `
      + 'a folder of its own — it has no single path, and the note is addressed at the source root '
      + `instead. Do not create \`${own}\` to satisfy it: a top-level folder holding source is an `
      + 'undeclared module, which `inspect` reports as an error and which governs nothing.',
  };
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
  const depth = moduleDepth(architecture);

  // Symmetric with the lint side: test files are exempt from structure.
  scan = dropTestFiles(scan, architecture.testFiles);

  const findings = [
    ...folderFindings(scan, architecture, layerNames, depth, buildFolderGraph(scan, architecture)),
    ...ownsFindings(architecture, dependencies),
    ...scan.files.flatMap((file) => importFindings(file, architecture, layerNames, depth)),
  ];

  for (const { cycle, component } of detectCycles(buildModuleGraph(scan, architecture).edges)) {
    // The members, not the printed path: a cycle is a set of mutually dependent
    // modules, and `a → b → a` and `b → a → b` are one knot printed from two
    // starting points. Keyed on the path, the same knot read from a different entry
    // node is a different baseline entry. The address is the first member for the
    // same reason — content-determined, and always one of the modules in the message.
    const members = [...new Set(cycle)].sort(compareText);

    findings.push(
      finding(
        'error',
        'cycle',
        members[0],
        members.join(' '),
        cycleMessage(cycle, component),
      ),
    );
  }

  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** The half both knot widths share — one text, because the same passage written twice drifts. */
const RATCHET_NOTE = ' If this cycle is in a baseline, the replacement arrives as a new finding '
  + 'rather than this one, because the subject is a different set of modules — so the gate can go '
  + 'red on strictly less debt. That is the ratchet reading the change: re-record with '
  + '`--update-baseline` rather than reverting the fix.';

/**
 * What a cycle finding may say about the knot around it: two widths that add a
 * sentence, and the shape where neither is true.
 *
 * Never a count of cycles. `detectCycles` reports one path per component on purpose,
 * because a graph's elementary cycles can outnumber its nodes exponentially, so "one
 * of three" is a number nothing here can produce. What it does have is the component
 * beside the path, which answers a narrower question honestly: whether the line names
 * every mutually dependent module or only some of them. Same discipline as
 * `projectCovers`, `syntheticPath` and {@link positionHint} — an unusual shape yields
 * no answer rather than a wrong one.
 *
 * Both arms say `can`, never `will`. Cutting an edge of the printed path can dissolve
 * the whole component: `a → b → a` inside `{a, b, c}` with `a → c` and `c → b` leaves
 * nothing cyclic once `b → a` goes, so a promise that the next run reports another
 * cycle here would be false.
 *
 * A knot is three or more mutually dependent modules, which is the only definition
 * available to a tool that refuses to count cycles. Two modules the path already names
 * have exactly two edges and therefore exactly one elementary cycle — cut either and
 * the component is gone — so the careful sentence is false there rather than cautious,
 * and a caveat on every ordinary cycle report is one none of them earned. A lone
 * self-loop is the same case, and reaches this only through `detectCycles`: the module
 * graph drops an edge from a module to itself (`resolve.ts`, `to !== from`).
 *
 * One corner, named rather than hidden: `{a, b}` carrying `a → a` alongside `a ↔ b`
 * does hold two cycles, and which arm fires depends on which edge `detectCycle` walked
 * first. Both endings are honest — the definite one names the pair, the silent one
 * withholds a true statement without making a false one — so nothing pins that
 * traversal order to force one.
 */
function cycleMessage(cycle: string[], component: string[]): string {
  const printed = `Import cycle between modules: ${cycle.join(' → ')}.`;
  const covered = new Set(cycle).size;

  if (covered < component.length) {
    return `${printed} This path does not name the whole knot: ${quoted(component)} are all `
      + 'mutually dependent here. Breaking the cycle above can leave the rest of them knotted, and '
      + `what is left is reported as a different cycle.${RATCHET_NOTE}`;
  }

  if (component.length > 2) {
    return `${printed} This path names every module in the knot, and whether another cycle runs `
      + 'through the same modules is not something inspect counts — so breaking the cycle above can '
      + `leave another one here.${RATCHET_NOTE}`;
  }

  return printed;
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
  if (!dependencies) return [];

  const prefix = sourcePrefix(architecture);

  // Modules own primitives too, and a declaration nothing reads is the defect this
  // finding exists to surface — at either level. Two passes rather than one over
  // both lists concatenated: the word the message opens with IS the level, and the
  // only thing that knows the level is which list the entry came out of. Read off a
  // loop variable's name instead, a module was announced as a "Layer" — the
  // opposite of the vocabulary the release ships.
  return [
    ...architecture.layers.flatMap((layer) => {
      const { path, note } = layerAddress(architecture, layer.name);

      return uninstalled(layer, dependencies)
        .map((pkg) => ownsFinding('Layer', layer.name, pkg, path, note));
    }),
    // A module is a folder at the top of the source tree, so its own address is
    // the one thing here that needs no explaining.
    //
    // undecidable, the `?? []` arm: a fabricated member carries no `owns`, so
    // `uninstalled` answers nothing and the map that would read its name never runs.
    ...(architecture.modules ?? []).flatMap((module) =>
      uninstalled(module, dependencies)
        .map((pkg) => ownsFinding('Module', module.name, pkg, `${prefix}${module.name}`, ''))),
  ];
}

/** The packages one owner declares that the project's dependency list does not carry. */
function uninstalled(owner: { owns?: OwnedPrimitive[] }, dependencies: string[]): string[] {
  return (owner.owns ?? []).flatMap((owned) => {
    // Both forms answer the same question here: whether the package resolves at
    // all. A named import missing from an installed package is a different one.
    const pkg = typeof owned === 'string' ? owned : 'package' in owned ? owned.package : null;

    return pkg !== null && !dependencies.includes(pkg) ? [pkg] : [];
  });
}

/** One `owns-not-installed` note, at whichever level declared the package. */
function ownsFinding(
  level: 'Layer' | 'Module',
  name: string,
  pkg: string,
  path: string,
  note: string,
): Finding {
  return {
    severity: 'info',
    rule: 'owns-not-installed',
    path,
    subject: pkg,
    message: `${level} "${name}" owns "${pkg}", which is not in package.json — `
      + 'runway, not a todo: the ban is emitted and correct, it just has nothing to '
      + 'reach yet. Installing the package and dropping the declaration are both '
      + `resolutions, and which one applies is the owner's call.${note}`,
  };
}

/** undeclared-folder, missing-layer, and no-entry findings. */
function folderFindings(
  scan: ScanResult,
  architecture: ArchitectureDef,
  layerNames: string[],
  depth: number,
  folders: FolderGraph,
): Finding[] {
  const findings: Finding[] = [];
  const prefix = sourcePrefix(architecture);

  // Whatever occupies the top level is what a top folder is checked against:
  // modules under `architecture.modules`, layers on a flat project. One list
  // swap rather than an offset — `scan.topDirs` is the same level either way,
  // and read against `layerNames` a modular repo reports every module as an
  // undeclared layer.
  // Asked of the field that answers it, so there is no absent case to invent a
  // list for: `moduleDepth` is this same fact expressed as an offset — it IS
  // `modules === undefined` — and the two cannot disagree.
  const { modules } = architecture;
  const modular = modules !== undefined;

  const declaredTop = modular ? modules.map((module) => module.name) : layerNames;

  // Lifted out of the loops below because each list is also a COUNT the structure
  // mismatch reads — the findings themselves, so the bridge and the evidence under
  // it can never disagree about how many there are.
  const sourceTop = scan.topDirs.filter(
    (dir) => scan.files.some((file) => file.segments[0] === dir),
  );

  const undeclared = sourceTop.filter((dir) => !declaredTop.includes(dir));
  const absent = declaredTop.filter((name) => !scan.topDirs.includes(name));

  // Pushed BEFORE its own evidence, and first of everything `analyze` produces: the
  // sort is by severity and stable, and this is the first error pushed, so it lands
  // on line one. A reader acts on the first message they meet — which is the defect
  // this bridge repairs, so printed below the lines it explains it explains nothing.
  //
  // undecidable, the middle conjunct, and shielded by the one under it: `absent`
  // covering every declared name means no declared name is in `topDirs` at all, and
  // `sourceTop` is a subset of `topDirs` — so no source folder can be a declared one
  // and `undeclared` is already the whole of `sourceTop`. It stays because
  // all-and-all is the rule, and half of it written down is a rule a reader has to
  // re-derive from a filter three lines up.
  if (
    sourceTop.length > 0
    && undeclared.length === sourceTop.length
    && absent.length === declaredTop.length
  ) {
    findings.push(structureMismatch(architecture, modular, sourceTop.length, declaredTop.length));
  }

  for (const dir of undeclared) {
    findings.push({
      severity: 'error',
      rule: modular ? 'undeclared-module' : 'undeclared-folder',
      path: `${prefix}${dir}`,
      // The four directory findings are one-per-directory by construction, so the
      // rule and the path already identify them and there is nothing left to
      // discriminate. Empty rather than a repeat of the path: a subject that
      // restates its path says the finding has a second axis when it has not.
      subject: '',
      message: modular
        ? `"${dir}" is not in \`architecture.modules\`, so nothing governs it. The layer globs `
        + 'are expanded from the declared list, so no glob matches inside this folder and '
        + 'every structural ban there is inert — it is ungoverned rather than unflagged, and '
        + `lint stays green throughout.${positionHint(dir, folders, declaredTop)}`
        : `"${dir}" is not a declared layer — declare it, or move its code into a module of an existing layer.`,
    });
  }

  for (const name of absent) {
    findings.push({
      severity: 'info',
      rule: modular ? 'missing-module' : 'missing-layer',
      path: `${prefix}${name}`,
      subject: '',
      // Reads like a todo without the second clause — six of these sent
      // a field agent toward "delete the unused layers", the opposite of
      // the keep-is-default doctrine the playbook states (field run #13).
      message: modular
        ? `Declared module "${name}" has no folder yet — runway, not a todo: its globs and bans `
        + 'are emitted and correct, they simply have nothing to reach. Building it and dropping '
        + 'the declaration are both resolutions, and which one applies is the owner\'s call.'
        : `Declared layer "${name}" has no folder yet — runway, not a todo: `
          + 'the rules arm when code lands; keeping it is the default, slimming is the owner\'s call.',
    });
  }

  // Under `modules` the loop above checks the MODULE axis — `declaredTop` holds
  // module names there — and the layer axis is checked nowhere, so a layer declared
  // in config and present in no module produced no finding at all. Same rule id: it
  // still describes a layer, and the two can never both fire for one name.
  //
  // No `scan.files.length` guard, deliberately. `missing-layer` has never had one —
  // it fires on an empty flat tree and always has — and this finding's own history
  // is where the answer to "it reads badly on a scaffold" already is: the second
  // clause below, after field run #13. Suppressing the note would override that with
  // the thing the wording fixed.
  if (modular) {
    for (const name of layerNames) {
      const { governed, optedOut } = modulesHolding(scan, modules, name, depth);

      if (governed.length) continue;

      const { path, note } = layerAddress(architecture, name);

      findings.push({
        severity: 'info',
        rule: 'missing-layer',
        path,
        // The layer's name, because every layer-level note under modules is addressed
        // at the source root: `rule` + `path` no longer identify one, so the `''` this
        // field documents for that case has lost its premise.
        subject: name,
        message: `Declared layer "${name}" holds no code in any module yet — runway, not a `
          + 'todo: the rules arm when code lands; keeping it is the default, slimming is the '
          + `owner's call.${note}${optedOutNote(prefix, name, optedOut)}`,
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
  // the coverage line already says so. It carries more weight under `modules` than it
  // did: the measurement below reports an empty tree and a tree whose only files sit
  // outside the layer vocabulary the same way, and the guard is what tells them apart.
  if (scan.files.length > 0) {
    for (const layer of architecture.layers) {
      const selfOnlyImporters = normalizeAllowedImporters(layer.allowedImporters)
        .filter((importer) => importer.selfOnly)
        .map((importer) => importer.layer);

      // Only a file some layer glob reaches can arm the ban — under `modules` the
      // declared, non-opted-out set, which is `modulesHolding`'s `governed` and the same
      // measurement `missing-layer` uses above. A bare `segments[depth]` test counts a
      // `layers: false` module's folder and an undeclared folder alike; no glob reaches
      // either, so it suppressed the note in the exact state the note reports. Flat asks
      // the files directly: there is no module list to ask, and `src/<layer>` IS the layer.
      const holdsFiles = modular
        ? modulesHolding(scan, modules, layer.name, depth).governed.length > 0
        : scan.files.some((file) => file.segments[depth] === layer.name);

      if (selfOnlyImporters.length && !holdsFiles) {
        // The emptiness this note reports is measured inside the modules, so it fires on
        // a modular repo too — and "it arms once code lands" is an instruction to put
        // code at the address, which is why the explanation is spliced in right
        // there rather than appended: the rest of this message is about a config
        // merge, and 700 characters is too far to carry the question.
        const { path, note } = layerAddress(architecture, layer.name);

        // "The layer holds no files" beside a visible `src/app/contexts/` is two truths
        // with nothing joining them, and the join is not in this message — it is
        // `missing-layer`'s `optedOutNote`, which #240 wrote. This note may lean on it
        // because that note fires on the same emptiness and its loop sits OUTSIDE the
        // guard above: whenever this one is emitted, that one is too, at the same
        // address, naming the same layer and the opted-out path (and `undeclared-module`
        // covers the other case). Move either half and this note quietly stops
        // explaining a folder the reader can see, with nothing failing.
        findings.push({
          severity: 'info',
          rule: 'declaratory-self-only',
          path,
          // Same reason as the note above, and the same value: under modules `path`
          // is the source root for every layer, so two selfOnly layers left at `''`
          // are one record written twice.
          subject: modular ? layer.name : '',
          message: `selfOnly on "${layer.name}" (importer(s): ${selfOnlyImporters.join(', ')}) is declaratory — the layer holds no files, so the re-export ban cannot fire yet; it arms once code lands.${note} The no-restricted-syntax ENTRY is emitted today, on the importer layer(s) named above, so it is already exposed to a merge: IF a second no-restricted-syntax scoped to one of those layers exists, flat config merges neither into the other — the later entry replaces the earlier, silently, with lint still green. That condition is the whole note. Adopting into a single generated config, there is no second entry, so there is nothing here to act on. "Cannot fire" is about the ban, not about the entry. Check \`blueprint rules --json\` for the emit points before merging.`,
        });
      }
    }
  }

  findings.push(...noEntryFindings(scan, architecture, depth));
  findings.push(...moduleNoEntryFindings(scan, architecture, depth));

  return findings;
}

/**
 * The one finding no per-folder finding is in a position to make: every top-level
 * source folder undeclared AND every declared position absent is one decision — the
 * `structure` — wearing the clothes of the N declarations it reads as.
 *
 * Floored on folders holding source, never on the tree being non-empty: "all
 * undeclared" is vacuously true at zero folders, so an unguarded rule fires on a
 * fresh Vite template under a CORRECT modular config and calls a one-minute-old
 * right answer a mismatch. `renderCoverage` refuses to call a net vacuous unless
 * `sourceFiles > 0` for the same reason — a ratio with an empty denominator is no
 * signal wearing one.
 *
 * It does not say which structure the tree looks like, because nothing here can:
 * that verdict is `survey`'s three-condition classifier, and `survey` sits above
 * `inspect`. So the declared structure is stated as the fact it is, the other is
 * offered as an alternative, and the one question only the owner can answer — are
 * these folders layers, or modules — goes back with a path for each answer.
 */
function structureMismatch(
  architecture: ArchitectureDef,
  modular: boolean,
  folders: number,
  declared: number,
): Finding {
  const root = sourceRoot(architecture);

  // One text, two token sets, for the reason `printConfigCaveats` is one text at two
  // indents: a mirror direction written out twice becomes a paraphrase that drifts.
  //
  // The edit each side names is a line the reader can find. `init` writes no
  // `structure` field for flat — flat is the preset default — so telling an adopter
  // to SET `structure: 'flat'` sends them hunting a line that was never written.
  const words = modular
    ? {
        structure: 'modular',
        declaredBy: '`architecture.modules`',
        noun: 'module',
        alternative: 'layers rather than modules',
        undeclaredRule: 'undeclared-module',
        missingRule: 'missing-module',
        edit: 'drop `structure: \'modular\'` from the preset call in blueprint.config.mjs — flat '
          + 'is the default, so there is no `structure: \'flat\'` to write in its place — or drop '
          + '`architecture.modules` from a hand-written `defineBlueprint`',
      }
    : {
        structure: 'flat',
        declaredBy: 'no `architecture.modules`',
        noun: 'layer',
        alternative: 'modules rather than layers',
        undeclaredRule: 'undeclared-folder',
        missingRule: 'missing-layer',
        edit: 'add `structure: \'modular\'` to the preset call in blueprint.config.mjs, or declare '
          + '`architecture.modules` in a hand-written `defineBlueprint`',
      };

  return {
    severity: 'error',
    rule: 'structure-mismatch',
    // The whole tree, so the source root is its address — the same one `layerAddress`
    // falls back to for a note that answers to no single folder.
    path: root,
    subject: '',
    // Ratios rather than the word "all": both halves are satisfied at one folder
    // against one, and a reader deciding what to do with this is owed the size of
    // the evidence rather than a quantifier that reads the same at every scale.
    message: `The config declares a ${words.structure} structure (${words.declaredBy}) and this `
      + `tree matches none of it: ${folders} of ${folders} top-level source folder(s) under `
      + `\`${root}\` undeclared, ${declared} of ${declared} declared ${words.noun}(s) with no `
      + `folder. That is one finding, not ${folders + declared} — every [${words.undeclaredRule}] `
      + `and [${words.missingRule}] entry in this report is its evidence, and each of them read `
      + `alone recommends the opposite of the fix: declare these folders as ${words.noun}s one at `
      + `a time and the report goes green over a ${words.noun} list that is only a copy of the `
      + 'folder names on disk. What is in question is the `structure` choice, not any single '
      + `declaration. If these folders are ${words.alternative}, ${words.edit}. If they are `
      + `${words.noun}s, the config is right and the code has not moved into them yet. Which of `
      + 'the two it is, is the owner\'s call and never an adopting agent\'s.',
  };
}

/**
 * Which declared modules hold code inside `layer`, split by whether they answer to
 * the layer vocabulary at all.
 *
 * Files, not `scan.topDirs`: that list is the first level under the source root, so a
 * layer folder sits inside a module and never appears in it — a real difference from
 * the flat check next door, which can read a layer's own top-level folder.
 *
 * `layers: false` modules are counted apart rather than skipped. They are not evidence
 * the layer governs anything — no layer glob is emitted inside them — but their folders
 * are visible to whoever reads the note, so the message has to account for them.
 *
 * One measurement for both layer-level notes: `missing-layer` and
 * `declaratory-self-only` read the same `governed` list, because "does a layer glob
 * reach any file here" is one question, and the plain `segments[depth]` test that used
 * to answer it for the second note counted an undeclared top folder and a
 * `layers: false` module alike. `declaratory-self-only`'s flat arm still asks the files
 * directly — there is no module list to ask, and a flat layer owns its own folder.
 */
function modulesHolding(
  scan: ScanResult,
  modules: ModuleDef[],
  layer: string,
  depth: number,
): { governed: string[]; optedOut: string[] } {
  const governed: string[] = [];
  const optedOut: string[] = [];

  for (const module of modules) {
    const holds = scan.files.some(
      (file) => file.segments[0] === module.name && file.segments[depth] === layer,
    );

    if (!holds) continue;

    if (module.layers === false) optedOut.push(module.name);
    else governed.push(module.name);
  }

  return { governed, optedOut };
}

/**
 * The `layers: false` folders a reader can see, and why they count for nothing here.
 *
 * Emitted only when such a file exists, and it names paths rather than modules because
 * a path is what the reader greps. "Holds no code in any module" beside a visible
 * `src/app/hooks/` is two truths with no bridge, which reads as the tool being wrong.
 *
 * Explanatory, never corrective: opting a module out of the layer vocabulary is a
 * design decision about a module whose internals are its router's business, so there is
 * no next step to name — and a sentence implying one would push an adopter to undo it.
 */
function optedOutNote(prefix: string, layer: string, optedOut: string[]): string {
  if (!optedOut.length) return '';

  const paths = optedOut.map((name) => `\`${prefix}${name}/${layer}\``).join(', ');

  return ` Code under ${paths} is not counted: \`layers: false\` opts a module out of the layer `
    + 'vocabulary, so no layer glob is emitted inside it and a folder sharing this layer\'s name '
    + 'is not this layer.';
}

/**
 * Where an undeclared module could legally sit, or why it could not.
 *
 * Declaring a module is a name AND a place in the order, and the import graph
 * knows both halves — so the finding hands over a draft rather than a demand.
 * It must not promise an answer it does not have: the same discipline
 * `projectCovers` and `syntheticPath` follow, where an unusual shape yields no
 * verdict rather than a wrong one.
 *
 * A module may only name modules declared after it, so an edge bounds the
 * position from one side: reaching M puts it before M, being reached by M puts
 * it after M.
 */
function positionHint(dir: string, folders: FolderGraph, modules: string[]): string {
  const index = new Map(modules.map((name, at) => [name, at]));

  // undecidable, the `?? []` arm: a fabricated member is a name no declared
  // module has, so the filter below drops it — the same empty list either way.
  const reaches = [...(folders.edges.get(dir) ?? [])]
    .filter((name) => index.has(name))
    .sort(compareText);

  const reachedBy = modules.filter((name) => folders.edges.get(name)?.has(dir));

  if (!reaches.length && !reachedBy.length) {
    return ' It imports no declared module and no declared module imports it, so every position '
      + 'in the order is legal — the name is the only decision left.';
  }

  // Insert at slot `p`: reaching M needs p <= index(M), being reached by M
  // needs p > index(M).
  const lowerAt = Math.max(...reachedBy.map((name) => index.get(name) as number), -1);
  const upperAt = Math.min(...reaches.map((name) => index.get(name) as number), modules.length);

  const measured = ` Measured from its imports:${
    reaches.length ? ` it reaches ${quoted(reaches)}` : ''
  }${reaches.length && reachedBy.length ? ';' : ''}${
    reachedBy.length ? ` ${quoted(reachedBy)} reaches it` : ''
  }.`;

  if (lowerAt + 1 > upperAt) {
    return `${measured} Those edges contradict — "${modules[lowerAt]}" must be declared before it `
      + `and it must be declared before "${modules[upperAt]}", which no ordering satisfies. That `
      + 'is the finding: the decomposition needs changing, not the config.';
  }

  const bound = reachedBy.length && reaches.length
    ? `after "${modules[lowerAt]}" and before "${modules[upperAt]}"`
    : reachedBy.length
      ? `after "${modules[lowerAt]}"`
      : `before "${modules[upperAt]}"`;

  return `${measured} Any position ${bound} is legal. Which one, and what it may import, is the `
    + 'owner\'s call — declaring a module is never an adopting agent\'s decision.';
}

/** `"a", "b"` — the module names as a message reads them. */
function quoted(names: string[]): string {
  return names.map((name) => `"${name}"`).join(', ');
}

/**
 * Unit folders inside a layer entry's own net with no entry file. The word is
 * `unit` and not `module`: under `modules` a module is the feature at the top
 * of the source tree, and {@link moduleNoEntryFindings} below reports that
 * level under this same rule id.
 *
 * A layer entry's net, not a layer NAME: `modules` is what the layer globs are
 * expanded over, so `scratch/hooks/useX` carries a declared layer's name in a
 * folder no glob reaches, and `app/hooks/useX` carries it inside a module whose
 * `layers: false` says that folder is not this layer. The twin one level up has
 * asked `modules` since it was written — one rule id answering at two levels
 * from two readings is the shape `fileZone` exists to close.
 */
function noEntryFindings(
  scan: ScanResult,
  architecture: ArchitectureDef,
  depth: number,
): Finding[] {
  const modules = new Map<string, ScannedFile[]>();

  for (const file of scan.files) {
    const layer = file.segments[depth];

    if (
      // A unit needs a layer and a folder of its own beneath it, so the file
      // sits at least two segments below wherever the layer is.
      file.segments.length >= depth + 3
      && fileZone(file.segments, architecture) === 'layer'
      && getModuleShape(architecture, layer).layout === 'folder'
    ) {
      // Module-qualified so two modules' same-named units stay two units.
      const key = file.segments.slice(0, depth + 2).join('/');

      modules.set(key, [...(modules.get(key) ?? []), file]);
    }
  }

  const findings: Finding[] = [];

  for (const [key, files] of modules) {
    const { entry } = getModuleShape(architecture, key.split('/')[depth]);

    const hasEntry = files.some(
      (file) =>
        file.segments.length === depth + 3 && stripExt(file.segments[depth + 2]) === entry,
    );

    if (!hasEntry) {
      findings.push({
        severity: 'warn',
        rule: 'no-entry',
        path: `${sourcePrefix(architecture)}${key}`,
        subject: '',
        message: `Unit "${key}" has no "${entry}" entry — nothing is importable from outside.`,
      });
    }
  }

  return findings;
}

/**
 * Declared modules whose folder holds source but carries no entry file.
 *
 * The feature-level twin of {@link noEntryFindings}, on that rule's own
 * argument one level up: a module's entry is its only public surface, so
 * `<alias>/<Module>` is the one address another module may write — the emitted
 * groups permit exactly it and ban `<alias>/<Module>/**` — and it resolves to
 * this file. Without it the module is one nothing can legally import, and no
 * gate said so: `missing-module` answers a module with no FOLDER, and the
 * cross-module bans are about the specifier rather than what it resolves to.
 *
 * One rule id carrying two levels, each with its own sentence, rather than a
 * second id — the shape `deep-import` already has since #264, where a unit
 * branch and a module branch answer under one name. The level is what the
 * message says, not what the id says.
 *
 * The entry name is `index` from {@link DEFAULT_MODULE_SHAPE} rather than read
 * off the config, because no field carries it: `entry` is a LayerDef's, and a
 * module has no layer to ask. It is also the name `init` writes into every
 * declared module and the one the handbook states.
 *
 * Only a module whose folder holds source. A declared module with no folder is
 * `missing-module` at info tier with "runway, not a todo" for its remedy, and
 * two findings over one state would answer it at two tiers with two remedies.
 */
function moduleNoEntryFindings(
  scan: ScanResult,
  architecture: ArchitectureDef,
  depth: number,
): Finding[] {
  const { modules, alias } = architecture;

  if (modules === undefined) return [];

  const prefix = sourcePrefix(architecture);
  const { entry } = DEFAULT_MODULE_SHAPE;

  return modules.flatMap((module) => {
    const files = scan.files.filter((file) => file.segments[0] === module.name);

    if (!files.length) return [];

    const hasEntry = files.some(
      (file) => file.segments.length === depth + 1 && stripExt(file.segments[depth]) === entry,
    );

    if (hasEntry) return [];

    return [{
      severity: 'warn' as const,
      rule: 'no-entry',
      path: `${prefix}${module.name}`,
      subject: '',
      message: `Module "${module.name}" has no "${entry}" entry — "${alias}/${module.name}" is the `
        + 'only address another module may write for it, and it resolves to that file, so nothing '
        + `can legally import this module today. Add \`${prefix}${module.name}/${entry}\` and `
        + 'export the module\'s public surface from it; everything else under the folder stays '
        + 'private, which is what the entry is for.',
    }];
  });
}

/**
 * Per-file import findings: deep-import, flow-violation, ownership, selfOnly,
 * the cross-module pair (undeclared-dependency, module-reexport), and the
 * relative family (src-escape, entry-bypass, layer-escape, root-import).
 */
function importFindings(
  file: ScannedFile,
  architecture: ArchitectureDef,
  layerNames: string[],
  depth: number,
): Finding[] {
  const fileLayer = file.segments[depth];
  // undecidable, the `?? []` arm: a fabricated member is a string with no `name`.
  // `crossModuleTarget` matches a specifier's first segment against the names by
  // `includes`, and the list then holds `undefined`, which no segment answers;
  // `crossModuleEdge` looks a module up by `name`, gets `undefined` back, and
  // reads that as a folder nothing governs — reporting nothing, which is what an
  // empty list yields too. It stays because the absent arm is real: every flat
  // project reaches here.
  const moduleDefs = architecture.modules ?? [];
  const moduleNames = moduleDefs.map((module) => module.name);

  // Which emitted entry governs this file — the whole answer, and the layer
  // name is not read again here to finish it. In two of the three zones
  // `segments[depth]` is not a layer name at all, and in the null case it can
  // BE one and still name nothing: `src/scratch/hooks/useX/index.ts` carries a
  // declared layer's name at layer depth under a folder `modules` does not
  // declare, and a guard that let the name overrule the zone judged it against
  // that layer's rules while the emitted config governed it with nothing.
  //
  //   'root'   a layered module's own composition files, under `src/<M>/*`
  //   'module' the whole net of a `layers: false` one, recursive from `src/<M>`
  //   'layer'  a declared layer's entry, expanded over declared modules only
  //   null     no emitted entry reaches it, at any depth
  //
  // Read through `zone` rather than a depth test spelled here, because doctor
  // dispatches its probes on the same `moduleZone` (`wiring.ts`:
  // `expectedStructural` for a layer, `expectedModuleBans` for a module zone).
  // Two derivations is how one file gets judged against a layer's rules on one
  // pass and a module's on the other, with nothing that fails to compile.
  const zone = fileZone(file.segments, architecture);

  // What no emitted glob reaches at all, in three positions: a folder inside a
  // LAYERED module that is not a declared layer (`Fighter/scratch/x.ts` — the
  // layer globs expand to declared layers only and `resolveModuleFiles` stops
  // at `src/Fighter/*`), anything under a top folder no `modules` entry
  // declares, and a flat project's undeclared top folder. Every ban there is
  // inert, so a finding would be red against a lint run that is green by
  // construction, with a remedy — declare it, or move the code — that is the
  // owner's call and not an adopting agent's. They are reported, by the outputs
  // positioned to report them: `coverage.outsideNets` names the file by path,
  // and `undeclared-module` names the folder.
  if (zone === null) return [];

  const aliases = aliasList(architecture);
  // Both lists are a LAYER's, so only a file a layer entry governs has one. The
  // root sits above every layer and may reach all of them, and no layer has
  // declared it a selfOnly importer; a `layers: false` module has no layer for
  // either question to be about. Asked of `fileLayer` in either module zone the
  // answer is empty anyway — a filename and an undeclared folder are both names
  // no layer carries — but that is an accident of the lookup, and stating the
  // rule once keeps it from becoming the next thing a reader has to re-derive.
  //
  // undecidable, both empty arms: each list is only ever read through
  // `.includes(target)` against a declared layer name — and in the module zone
  // the alias branch continues before either is read at all — so a fabricated
  // member matches nothing and no verdict moves.
  const forbidden = zone === 'layer' ? getForbiddenLayers(architecture, fileLayer) : [];
  const selfOnly = zone === 'layer' ? getSelfOnlyTargets(architecture, fileLayer) : [];
  const layoutOf = layoutResolver(architecture);
  const entryOf = entryResolver(architecture);
  const rootName = sourceRootName(sourceRoot(architecture));
  const findings: Finding[] = [];

  for (const ref of file.imports) {
    const parts = stripAlias(ref.specifier, aliases);

    // Resolved before the layer branch and read by both cross-module findings
    // below, because a specifier addressing another module names it at segment
    // 0 and reaches no declared layer at all — read through the layer test
    // alone it is skipped in silence.
    //
    // undecidable, the depth test, and shielded by ONE line above: `moduleNames`
    // is `(architecture.modules ?? []).map(…)`, so at depth 0 it is empty and
    // `crossModuleTarget` answers `null` — the same value the false arm gives.
    // Build that list from anything a flat project can fill and this proof is
    // void. The test stays as the reader's signpost: this arm exists only under
    // modules.
    const moduleTarget = depth > 0
      ? crossModuleTarget(ref.specifier, aliases, moduleNames, file.segments[0])
      : null;

    // The pass-through, sharing one verdict with the plugin rule. Judged
    // before the layer branch: `~app/Combat` names a MODULE and reaches no
    // declared layer, so the layer test below skips it and the finding would
    // never fire. Only the `export … from` spelling reaches here — `scan`
    // reads source text and cannot follow a local binding from an import to
    // an export, which is exactly why the other spellings need a rule with a
    // scope, and why the derivation note on every report states that boundary.
    if (ref.isExport && moduleTarget !== null) {
      findings.push(finding('error', 'module-reexport', file.path, moduleTarget, `Re-exports "${moduleTarget}" through this module's own surface — a consumer that needs it declares it in its own \`imports\`, or this module exposes its own API instead of forwarding someone else's. Wrapping the call in a function that only forwards it satisfies the rule and buys nothing: a wrapper is right when it expresses this module's own responsibility.`));
    }

    if (parts) {
      // Crossing the module is decided first, and every test below is why:
      // `target`, `forbidden` and `selfOnly` all read `parts[depth]`, a LAYER
      // name, so any of them running on a specifier that addresses another
      // module is a verdict about a folder this file cannot see — `hooks` in
      // one module and `hooks` in another compare equal by name alone.
      // `relativeVerdict` answers the relative spelling of this same question
      // one line into its modular arm; this is the alias spelling.
      if (depth > 0 && parts[0] !== file.segments[0]) {
        const edge = crossModuleEdge(file, ref, parts, moduleTarget, moduleDefs);

        if (edge) findings.push(edge);

        continue;
      }

      // What is left in this arm addresses this module's own folders, and every
      // test below reads one of them as a LAYER name. A `layers: false` module
      // has none, so there is nothing here to be inside, above or forbidden by:
      // the emitted entry for it carries no structural group, no `paths` root
      // ban and no `blueprint/no-module-root-import`, and `~app/app/store` from
      // inside `app` is green in a real lint run. Silence, matching it.
      //
      // The ROOT zone does not continue here, and that is the difference
      // between the two: its module HAS layers, and the entry emitted for it
      // carries the unit-entry group over every folder-layout one
      // (`~app/<Module>/<layer>/*/**`), which is `deep-import` below.
      if (zone === 'module') continue;

      // The alias reaches the source root, so a modular specifier spells
      // `~app/<Module>/<layer>/<unit>` and the layer sits at the same offset
      // here as it does in a file path. Read at 0 it is the module name, no
      // layer matches, and every alias import is skipped in silence.
      const target = parts[depth];

      // The alias spelling of the upward edge, shared with the plugin rule so
      // the two gates cannot answer differently — the relative spelling arrives
      // as `reaches-root` from `relativeVerdict`, next door.
      const ownRoot = addressesModuleRoot(parts, file.segments[0], layerNames, depth);

      if (zone === 'layer' && ownRoot) {
        findings.push(finding('error', 'root-import', file.path, ref.specifier, `"${ref.specifier}" reaches up to the module root — the root composes the layers, so nothing inside one may import back up to it. Move the shared part into a layer, or pass it in from the root.`));

        continue;
      }

      // undecidable: a specifier addressing another module continued above, so
      // what reaches here is this module's own non-layer targets — which is
      // `addressesModuleRoot`, answered one branch up for every file but the
      // module root — and a flat project's. Every branch below is keyed on the
      // target BEING a declared layer: `layoutOf` answers `file` for an unknown
      // name, and neither the same-layer nor the forbidden test can match.
      // Skipping it pushes nothing.
      if (!layerNames.includes(target)) continue;

      // Depth is judged against the *target* layer's layout — reaching inside
      // a folder-module layer is a violation wherever the import comes from.
      if (layoutOf(target) === 'folder' && parts.length >= depth + 3) {
        findings.push(finding('error', 'deep-import', file.path, ref.specifier, `"${ref.specifier}" reaches inside a unit — import it through its entry.`));
      }

      if (target === fileLayer) {
        findings.push(finding('error', 'flow-violation', file.path, ref.specifier, `Same-layer import "${ref.specifier}" via the alias — use a relative path or extract to a lower layer.`));
      } else if (forbidden.includes(target)) {
        findings.push(finding('error', 'flow-violation', file.path, ref.specifier, `"${fileLayer}" may not import "${target}" ("${ref.specifier}").`));
      }

      if (ref.isExport && selfOnly.includes(target)) {
        findings.push(finding('error', 'selfonly-reexport', file.path, ref.specifier, `Re-exports "${target}" ("${ref.specifier}"), which is selfOnly — depend on it, do not re-export it.`));
      }
    } else if (ref.specifier.startsWith('.')) {
      // Neither module zone reaches here, and ONE fact decides both:
      // `blueprint/relative-escape` opens on `segments[depth] in layouts` and
      // registers no visitor otherwise. At a `layers: false` module that
      // segment is an undeclared folder; at a layered module's root it is the
      // file's own name. The rule never runs in either, so every verdict below
      // would be a finding against a lint run that is green — the
      // inspect-red-lint-green shape #264 resolved to silence.
      //
      // Three verdicts are reachable at a root and each was measured green:
      // `escapes-src`, `leaves-module`, and the root's own reach past a unit's
      // entry. The last is the sharpest, because the ALIAS spelling of that
      // same reach IS banned, on this module's own entry — one reach, two
      // spellings, and only one of them expressible as a pattern. Closing that
      // is a rule that does not run, which is the lint side's to fix and not a
      // second reading here.
      if (zone !== 'layer') continue;

      const escape = relativeEscape(file, ref, layoutOf, entryOf, depth, rootName);

      if (escape) findings.push(escape);
    } else {
      // Both levels, each judged against the thing that holds this file: its
      // layer, and its module. A module-owned package is barred everywhere
      // except its owning module, whatever layer the importer sits in.
      const owners = ownersOf(architecture.layers, ref.specifier, ref.names);
      // undecidable, the `?? []` arm: a fabricated member carries no `owns`, so
      // `ownersOf` skips it and answers `null` — which is what an empty list
      // answers too, and what the guard below reads as "no module owns this".
      const moduleOwners = ownersOf(architecture.modules ?? [], ref.specifier, ref.names);
      // undecidable, the depth test, and shielded by the line above: on a flat
      // project `moduleOwners` is `null`, so the guard short-circuits before this
      // value is read at all. Make `moduleOwners` answerable without `modules`
      // and this proof is void. The test stays because the module a file sits in
      // is a fact only a modular tree has.
      const ownModule = depth > 0 ? file.segments[0] : undefined;

      // undecidable, the `ownModule !== undefined` conjunct, shielded by the two
      // lines above in the other direction: `moduleOwners` is non-null only when
      // `modules` is declared, which is exactly when `moduleDepth` is above 0 and
      // `ownModule` holds a segment. So this conjunct can never be the one that
      // fails. It stays as the narrowing that lets `ownModule` be read as a
      // string in the message below.
      if (moduleOwners && ownModule !== undefined && !moduleOwners.includes(ownModule)) {
        const named = ref.names.length ? ` (${ref.names.join(', ')})` : '';

        const subject = ref.names.length
          ? `${ref.specifier} ${[...ref.names].sort(compareText).join(',')}`
          : ref.specifier;

        findings.push(finding('error', 'package-ownership', file.path, subject, `"${ref.specifier}"${named} is owned by module ${moduleOwners.join(', ')} — not importable from "${ownModule}".`));
      }

      // The layer half of the same question, and only where a LAYER entry holds
      // this file. A layer's `owns` is emitted onto the layer entries alone; a
      // module's own entry — root zone or module zone — carries the
      // module-level bans and none of these. In either module zone `fileLayer`
      // is a name no `allowedIn` list can hold, a filename at a root and an
      // undeclared folder below a `layers: false` module, so every
      // layer-owned package would be banned across the whole zone against a
      // green lint run — and the message would name that filename as the layer
      // it was not importable from. The module half above still fires in both:
      // `owns` is one of the four things `ModuleDef.layers` promises still
      // reach inside, and it is emitted onto exactly the entry these files sit
      // under.
      if (zone === 'layer' && owners && !owners.includes(fileLayer)) {
        const named = ref.names.length ? ` (${ref.names.join(', ')})` : '';

        // The names are part of the subject, not just of the sentence: one file can
        // import two different restricted names from the same package, and those are
        // two debts with two fixes. Sorted, because `{ a, b }` and `{ b, a }` are the
        // same import written twice.
        const subject = ref.names.length
          ? `${ref.specifier} ${[...ref.names].sort(compareText).join(',')}`
          : ref.specifier;

        findings.push(finding('error', 'package-ownership', file.path, subject, `"${ref.specifier}"${named} is owned by ${owners.join(', ')} — not importable from "${fileLayer}".`));
      }
    }
  }

  return findings;
}

/**
 * What an alias specifier addressing ANOTHER module does to the boundary
 * between them — the edge `emitLint` bans as a `no-restricted-imports` group,
 * read here off the same `ModuleDef.imports` the emitter compiles from.
 *
 * Which module is addressed is `crossModuleTarget`'s answer, shared with
 * `blueprint/no-module-reexport` so the two gates cannot resolve it
 * differently. Whether this module may name it is derived here rather than in
 * `boundary`: a `no-restricted-imports` shape CAN express this set — #182
 * emits it as per-importing-module ban groups — so a shared verdict would have
 * exactly one caller, the other side being a generated config rather than a
 * rule that could call anything. What holds the reading to the generator is a
 * both-ways equality test against `emitLint`'s own output.
 *
 * Null wherever a lint run stays green, so the two gates agree about silence
 * too: a target no `modules` entry declares. No glob reaches it, which
 * `undeclared-module` reports at the folder level — the level that can act on
 * it. The matching case on the IMPORTER's side is answered before this is
 * called: `importFindings` returns on a null zone, and under `modules` a zone
 * is named only for a file whose top folder is a declared module.
 */
function crossModuleEdge(
  file: ScannedFile,
  ref: ImportRef,
  parts: string[],
  moduleTarget: string | null,
  modules: ModuleDef[],
): Finding | null {
  if (moduleTarget === null) return null;

  // The lookup cannot miss, by the zone the caller decided before its loop —
  // the same list, asked the same question, one branch earlier. It used to be
  // asked twice and answer `null` here for a file the first ask had already let
  // through, which is the shape that let an undeclared folder be governed at
  // all.
  const own = modules.find((module) => module.name === file.segments[0]) as ModuleDef;

  if ((own.imports ?? []).includes(moduleTarget)) {
    // The entry, and nothing under it — the one address a declared dependency
    // exposes, and the same line the emitted groups draw between
    // `~app/<Target>` and `~app/<Target>/**`.
    if (parts.length === 1) return null;

    // Spelled as this specifier spells it, alias and all, because the fix is a
    // string the reader types rather than a shape they have to derive.
    const entry = ref.specifier.slice(0, ref.specifier.length - parts.slice(1).join('/').length - 1);

    return finding('error', 'deep-import', file.path, ref.specifier, `"${ref.specifier}" reaches inside module "${moduleTarget}" — import it through its entry, "${entry}". "${moduleTarget}" is declared in "${own.name}"'s \`imports\`, so the entry itself is reachable; what sits behind it is that module's own business.`);
  }

  // A module may only name modules declared after it, so a backwards edge
  // cannot be declared at all and the remedy above would be a wrong
  // instruction. Computed rather than carried as a caveat on both: on a plain
  // forward edge that sentence is true and irrelevant, which is the shape a
  // reader learns to skip past the one time it matters.
  const backwards = modules.findIndex((module) => module.name === moduleTarget)
    < modules.findIndex((module) => module.name === own.name);

  const remedy = backwards
    ? `"${moduleTarget}" is declared BEFORE "${own.name}", and a module may only name modules declared after it — so this edge cannot be declared at all. The decomposition is what needs changing, not the config.`
    : `Add "${moduleTarget}" to "${own.name}"'s \`imports\` in blueprint.config.mjs, or move the shared part into a module both may reach. Declaring is the owner's call, never an adopting agent's.`;

  return finding('error', 'undeclared-dependency', file.path, ref.specifier, `"${ref.specifier}" reaches module "${moduleTarget}", which "${own.name}" does not declare — a module reaches nothing it has not named. ${remedy}`);
}

function relativeEscape(
  file: ScannedFile,
  ref: ImportRef,
  layoutOf: LayoutOf,
  entryOf: EntryOf,
  depth: number,
  rootName: string,
): Finding | null {
  const target = resolveSegments(file.segments.slice(0, -1), ref.specifier);
  const verdict = relativeVerdict(file.segments, target, layoutOf, entryOf, depth);

  if (verdict === 'ok') return null;

  // The same condition the verdict reports as `escapes-src`, tested here as
  // itself: past this point the target resolved, which is what lets the
  // messages below name a segment of it.
  if (target === null) {
    return finding('error', 'src-escape', file.path, ref.specifier, `Relative import "${ref.specifier}" escapes ${rootName} — use the project alias.`);
  }

  if (verdict === 'reaches-inside') {
    // The entry named is the TARGET's layer — the importer's own for a sibling,
    // and deliberately not for the module root reaching down into a layer it
    // does not belong to.
    return finding('error', 'entry-bypass', file.path, ref.specifier, `Relative import "${ref.specifier}" reaches past a sibling's entry — import "${entryOf(target[depth])}" instead; what lives behind it is that unit's own business.`);
  }

  if (verdict === 'reaches-root') {
    return finding('error', 'root-import', file.path, ref.specifier, `Relative import "${ref.specifier}" reaches up to the module root — the root composes the layers, so nothing inside one may import back up to it. Move the shared part into a layer, or pass it in from the root.`);
  }

  if (verdict === 'leaves-module') {
    return finding('error', 'module-escape', file.path, ref.specifier, `Relative import "${ref.specifier}" leaves this module — cross a module boundary through the alias, and declare the dependency in \`imports\`; a relative path cannot express it.`);
  }

  return finding('error', 'layer-escape', file.path, ref.specifier, `Relative import "${ref.specifier}" leaves this layer — use the alias, or extract shared code to a lower layer.`);
}

/**
 * Owners of a package import (given its named imports), or null if unrestricted.
 *
 * Takes the owner list rather than the architecture, because ownership is two
 * levels: a layer owns a primitive against every other layer, and a module owns
 * one against every other module. Written against `layers` alone, a
 * module-owned package is banned by lint and invisible here — the split this
 * file's own `relative-escape` doctrine exists to prevent.
 */
function ownersOf(
  owners_: { name: string; owns?: OwnedPrimitive[] }[],
  specifier: string,
  names: string[],
): string[] | null {
  const owners: string[] = [];

  for (const layer of owners_) {
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

/** One knot: the cycle a report prints, and every module mutually dependent with it. */
export interface CycleKnot {
  /** The representative path, its first node repeated at the end. */
  cycle: string[];
  /** The whole strongly connected component the path was found in, in name order. */
  component: string[];
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
 *
 * The component rides along with its path because {@link cycleMessage} has to say
 * whether that path names the whole knot. It is in hand at this line either way;
 * asking for it again at the call site would be a second Tarjan run and a second
 * answer to one question.
 */
export function detectCycles(edges: Map<string, Set<string>>): CycleKnot[] {
  return stronglyConnected(edges)
    .map((component) => ({
      cycle: detectCycle(subgraph(edges, component)),
      // Sorted here and not before the `subgraph` call: that function sorts its own
      // copy to make the representative path reproducible, and handing it an
      // already-sorted list would leave its sort deciding nothing.
      component: [...component].sort(compareText),
    }))
    .filter((knot): knot is CycleKnot => knot.cycle !== null)
    // Content-ordered, not traversal-ordered — Tarjan's output depends on its
    // starting key, and a report that reshuffles on an unrelated file is unreadable.
    .sort((a, b) => compareText(a.cycle[0], b.cycle[0]));
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
      const component = stack.splice(stack.indexOf(node));

      for (const member of component) onStack.delete(member);

      components.push(component);
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
    if (index.has(node)) continue;

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
      if (stack.has(next)) return [...path.slice(path.indexOf(next)), next];

      if (!visited.has(next)) {
        const found = dfs(next, [...path, next]);

        if (found) return found;
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

      if (found) return found;
    }
  }

  return null;
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

function finding(
  severity: Severity,
  rule: string,
  path: string,
  subject: string,
  message: string,
): Finding {
  return { severity, rule, path, subject, message };
}
