export type FindingMessageFact
  = | { kind: 'cycle'; cycle: string[] }
    | { kind: 'owns-not-installed'; layer: string; package: string }
    | {
      kind: 'package-ownership';
      specifier: string;
      names: string[];
      owners: string[];
      importer: string;
    }
    | { kind: 'relative-escape-source'; specifier: string; sourceRoot: string }
    | { kind: 'relative-escape-entry'; specifier: string; entry: string }
    | { kind: 'relative-escape-layer'; specifier: string }
    | { kind: 'canonical-alias'; subject: string; canonicalSpecifier: string }
    | { kind: 'deep-import'; subject: string }
    | { kind: 'same-layer-alias'; subject: string }
    | { kind: 'selfonly-reexport'; target: string; specifier: string }
    | {
      kind: 'dependency-flow';
      importer: string;
      target: string;
      subject: string;
      failed: string[];
    }
    | { kind: 'undeclared-folder'; name: string; subject: 'module' | 'layer' }
    | { kind: 'undeclared-inner-layer'; layer: string; module: string }
    | { kind: 'missing-position'; name: string; subject: 'module' | 'layer' }
    | { kind: 'declaratory-self-only'; layer: string; importers: string[] }
    | { kind: 'no-entry'; unit: string; entry: string; directFile?: string };

type GeneralFindingFact = Extract<FindingMessageFact, {
  kind: 'cycle' | 'owns-not-installed' | 'package-ownership'
    | 'relative-escape-source' | 'relative-escape-entry' | 'relative-escape-layer';
}>;
type DependencyFindingFact = Extract<FindingMessageFact, {
  kind: 'canonical-alias' | 'deep-import' | 'same-layer-alias'
    | 'selfonly-reexport' | 'dependency-flow';
}>;
type FolderFindingFact = Exclude<FindingMessageFact, GeneralFindingFact | DependencyFindingFact>;

export function renderFindingMessage(fact: FindingMessageFact): string {
  if (['cycle', 'owns-not-installed', 'package-ownership', 'relative-escape-source',
    'relative-escape-entry', 'relative-escape-layer'].includes(fact.kind)) {
    return renderGeneralFinding(fact as GeneralFindingFact);
  }

  if (['canonical-alias', 'deep-import', 'same-layer-alias', 'selfonly-reexport',
    'dependency-flow'].includes(fact.kind)) {
    return renderDependencyFinding(fact as DependencyFindingFact);
  }

  return renderFolderFinding(fact as FolderFindingFact);
}

function renderGeneralFinding(fact: GeneralFindingFact): string {
  switch (fact.kind) {
    case 'cycle':
      return `Import cycle between units: ${fact.cycle.join(' → ')}.`;
    case 'owns-not-installed':
      return `Layer "${fact.layer}" owns "${fact.package}", which is not in package.json — `
        + 'runway, not a todo: the ban is emitted and correct, it just has nothing to '
        + 'reach yet. Installing the package and dropping the declaration are both '
        + 'resolutions, and which one applies is the owner\'s call.';

    case 'package-ownership': {
      const named = fact.names.length ? ` (${fact.names.join(', ')})` : '';

      return `"${fact.specifier}"${named} is owned by ${fact.owners.join(', ')} — `
        + `not importable from "${fact.importer}".`;
    }

    case 'relative-escape-source':
      return `Relative import "${fact.specifier}" escapes ${fact.sourceRoot} — use the project alias.`;
    case 'relative-escape-entry':
      return `Relative import "${fact.specifier}" reaches past a sibling's entry — `
        + `import "${fact.entry}" instead; what lives behind it is that unit's own business.`;
    case 'relative-escape-layer':
      return `Relative import "${fact.specifier}" leaves this layer — use the alias, or `
        + 'extract shared code to a lower layer.';
  }
}

function renderDependencyFinding(fact: DependencyFindingFact): string {
  switch (fact.kind) {
    case 'canonical-alias':
      return `"${fact.subject}" crosses an architectural boundary through a secondary alias — `
        + `use the canonical source-root spelling "${fact.canonicalSpecifier}".`;
    case 'deep-import':
      return `"${fact.subject}" reaches inside a unit — import it through its entry.`;
    case 'same-layer-alias':
      return `Same-layer import "${fact.subject}" via the alias — use a relative path or `
        + 'extract to a lower layer.';
    case 'selfonly-reexport':
      return `Re-exports "${fact.target}" ("${fact.specifier}"), which is selfOnly — `
        + 'depend on it, do not re-export it.';
    case 'dependency-flow':
      return `"${fact.importer}" may not import "${fact.target}" ("${fact.subject}") — `
        + `${fact.failed.join('; ')}.`;
  }
}

function renderFolderFinding(fact: FolderFindingFact): string {
  switch (fact.kind) {
    case 'undeclared-folder':
      return `"${fact.name}" is not a declared ${fact.subject} — move its code into an `
        + `existing ${fact.subject}, or ask the owner to update the architecture contract.`;
    case 'undeclared-inner-layer':
      return `"${fact.layer}" is not a declared layer inside module "${fact.module}" — `
        + 'move its code into an existing layer, or ask the owner to update the shared '
        + 'layer contract.';
    case 'missing-position':
      return `Declared ${fact.subject} "${fact.name}" has no folder yet — runway, not a todo: `
        + 'the rules arm when code lands; keeping it is the default, '
        + 'slimming is the owner\'s call.';
    case 'declaratory-self-only':
      return `selfOnly on "${fact.layer}" (importer(s): ${fact.importers.join(', ')}) is declaratory — `
        + 'the layer holds no files, so the re-export ban cannot fire yet; it arms once code '
        + 'lands. The no-restricted-syntax ENTRY is emitted today, on the importer layer(s) '
        + 'named above, so it is already exposed to a merge: IF a second '
        + 'no-restricted-syntax scoped to one of those layers exists, flat config merges '
        + 'neither into the other — the later entry replaces the earlier, silently, with lint '
        + 'still green. That condition is the whole note. Adopting into a single generated '
        + 'config, there is no second entry, so there is nothing here to act on. "Cannot fire" '
        + 'is about the ban, not about the entry. Check `blueprint rules --json` for the emit '
        + 'points before merging.';
    case 'no-entry':
      return fact.directFile
        ? `File "${fact.directFile}" sits directly in a folder-layout layer; it is not a folder unit missing an entry. Review the layer layout or place unit implementation inside its folder; do not create a nested entry for a layer barrel.`
        : `Unit "${fact.unit}" has no "${fact.entry}" entry — the declared folder-unit public entry is missing.`;
  }
}
