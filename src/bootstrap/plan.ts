import path from 'node:path';

import { aliasActions } from './alias';
import { assertContained } from './contain';
import { defaultAgentPaths, emitAgentFiles } from '../emit/agent';
import type { AgentFile } from '../emit/agent';
import { emitHandbook, handbookPath } from '../emit/docs';
import { eslintConfigSource, eslintWiringNote } from './eslint';
import { injectBetweenMarkers } from '../markdown';
import type { AgentTarget, Blueprint, EmitDef, LayerDef } from '../config';
import { SUPPORTED_ESLINT_MAJORS } from '../project';
import type { PackageManager, ProjectState } from '../project';
import type { Action } from './types';

const MARKER = 'BLUEPRINT';

export interface PlanOptions {
  /**
   * The blueprint config source init is about to write, or null when the repo
   * already has one. Three of the plan's branches turn on it: it is what makes a
   * run a fresh scaffold rather than a re-run over someone's own config.
   */
  configSource?: string | null;
  /** Skip the install action when false. */
  install?: boolean;
  /** Existing content of merge-strategy agent files, keyed by their resolved path. */
  existingAgentFiles?: Record<string, string | null>;
  /** Narrow the default contract targets to the one tool in use (`--agent`). */
  agentTarget?: AgentTarget;
  /** The source tree already holds code — skip empty-layer scaffolding. */
  hasSourceFiles?: boolean;
}

/**
 * Optional gates blueprint recommends but never installs: zero-config knip
 * false-flags entry points, so shipping it commented-out (or pre-installed but
 * unused) would be a dangling promise.
 */
const TOOLING_NOTES: Action[] = [
  {
    kind: 'instruct',
    note: 'Dead code (optional): `blueprint inspect` reports dead files; for dead *exports*, '
      + 'install knip and configure its entry points — that is the source of truth, '
      + 'not the warn-tier `import/no-unused-modules`.',
  },
  {
    kind: 'instruct',
    note: 'CSS token governance (optional): install stylelint + '
      + '@csstools/stylelint-value-no-unknown-custom-properties, '
      + 'pointing importFrom at your token source file.',
  },
];

/** Decide every effect `init` will perform. Pure — reads facts, returns actions. */
export function plan(
  state: ProjectState,
  blueprint: Blueprint,
  options: PlanOptions = {},
): Action[] {
  const { architecture, emit } = blueprint;
  const { configSource = null } = options;
  const handbook = handbookPath(blueprint);

  const agentFiles = emitAgentFiles(
    blueprint,
    options.agentTarget ? [options.agentTarget] : undefined,
  );

  const actions: Action[] = [
    ...(configSource === null
      ? []
      : [configWrite(configSource)]),
    // Where code already lives, an unbuilt layer's absence is its true state — a
    // .gitkeep shell is the manufactured net the playbook forbids.
    ...(options.hasSourceFiles ? [] : scaffoldDirs(state, architecture.layers)),
    { kind: 'write', path: handbook, content: emitHandbook(blueprint), note: handbook },
    ...agentContractActions(agentFiles, options.existingAgentFiles),
    ...staleContractActions(agentFiles, emit, options),
    ...eslintConfigActions(blueprint, state),
    // Every local write lands before the one child process — SECURITY.md's rule for
    // the other spawn, applied to the install. An aborted install then leaves a tree
    // complete except for `node_modules`, rather than one missing its alias wiring
    // (field run #131).
    ...aliasActions(state, architecture, configSource !== null),
    ...installActions(state, options),
    ...TOOLING_NOTES,
  ];

  // Last, over the finished list, so no path source can be added above and miss
  // it — and in the planner rather than only at the effect, so `--dry-run` never
  // prints a plan the real run would refuse. A divergence between the printed
  // plan and what apply does is itself in `SECURITY.md`'s scope.
  assertContained(actions);

  return actions;
}

function configWrite(configSource: string): Action {
  return {
    kind: 'write',
    path: 'blueprint.config.mjs',
    content: configSource,
    note: 'blueprint.config.mjs',
  };
}

/** One `.gitkeep` shell per declared layer the source tree does not have yet. */
function scaffoldDirs(state: ProjectState, layers: LayerDef[]): Action[] {
  return layers
    .filter((layer) => !state.existingSrcDirs.includes(layer.name))
    .map((layer) => ({
      kind: 'mkdir',
      path: `src/${layer.name}`,
      note: `src/${layer.name}/`,
    }));
}

/** What each emitted agent contract does to whatever already sits at its path. */
function agentContractActions(
  files: AgentFile[],
  existingAgentFiles: Record<string, string | null> | undefined,
): Action[] {
  return files.flatMap((file) =>
    contractActions(file, existingAgentFiles?.[file.path] ?? null),
  );
}

/** One contract file: refreshed in place, referenced beside, or written outright. */
function contractActions(file: AgentFile, existing: string | null): Action[] {
  if (file.strategy !== 'merge') {
    return [{
      kind: 'write',
      path: file.path,
      content: file.content,
      note: `${file.path} (agent contract)`,
    }];
  }

  // Already integrated by its owner, symmetric with the wired eslint config.
  // The trade is stated: with no markers there is nothing init can refresh, so
  // a later config change silently strands the copy (field issue #26).
  if (existing !== null && !hasMarker(existing) && existing.includes('@kekkai/blueprint')) {
    return [{
      kind: 'instruct',
      note: `${file.path} already integrates the blueprint contract without markers — left as is, `
        + 'and init can never refresh it: after config changes, update it by hand — '
        + 'or wrap the '
        + `generated block in <!-- ${MARKER}:START --> / <!-- ${MARKER}:END --> once, and every `
        + 'later init rewrites just that block.',
    }];
  }

  if (existing !== null && !hasMarker(existing)) {
    return referenceActions(file);
  }

  return [{
    kind: 'write',
    path: file.path,
    content: mergeContract(existing, file.content),
    note: `${file.path} (agent contract)`,
  }];
}

/**
 * A hand-written context file is a document someone maintains — appending a
 * generated block is graffiti, so leave a reference beside it instead. The
 * reference ships WITH its markers, or the header's "init rewrites only
 * between them" is a claim the reader cannot see (field issue #26).
 */
function referenceActions(file: AgentFile): Action[] {
  // `.blueprint` goes before whatever the extension is, not a literal `.md`:
  // `emit.agents` accepts any path, and a `.mdc` target produced a reference
  // path IDENTICAL to the file's own, so the write landed ON the document.
  // `extname` answers '' for a dotfile, giving `.gitignore.blueprint`.
  const ext = path.extname(file.path);

  const reference = ext
    ? `${file.path.slice(0, -ext.length)}.blueprint${ext}`
    : `${file.path}.blueprint`;

  return [
    {
      kind: 'write',
      path: reference,
      content: mergeContract(null, file.content),
      note: `${reference} (reference — hand-written ${file.path} left untouched)`,
    },
    {
      kind: 'instruct',
      note: `${file.path} is hand-written, so it was not touched. Integrate ${reference} into it — `
        + 'follow the document\'s own structure, link rather than duplicate, and KEEP the '
        + `<!-- ${MARKER}:START/END --> marker comments around the generated block: they are what `
        + 'lets a later init refresh the block after config changes (integrating without '
        + 'them '
        + 'means updating it by hand, forever) — then delete the reference. '
        + '(An agent running '
        + 'the authoring playbook does this as its final step.)',
    },
  ];
}

/**
 * A contract the current `emit.agents` no longer names is stale. Wholly generated
 * files are init's to remove; one carrying hand-written content only gets told.
 * The note names the ACTUAL cause of the narrowing — a deletion blamed on a config
 * field that is not there reads as breakage.
 */
function staleContractActions(
  files: AgentFile[],
  emit: EmitDef | undefined,
  options: PlanOptions,
): Action[] {
  const emitted = new Set(files.map((file) => file.path));

  const cause
    = emit?.agents !== undefined
      ? 'no longer in emit.agents'
      : options.agentTarget !== undefined
        ? 'narrowed by --agent; declare emit.agents in blueprint.config.mjs to make this permanent'
        : 'not among the emitted targets';

  const actions: Action[] = [];

  for (const spec of defaultAgentPaths()) {
    const existing = options.existingAgentFiles?.[spec.path] ?? null;

    if (emitted.has(spec.path) || existing === null) {
      continue;
    }

    if (spec.strategy === 'own' || isWhollyGenerated(existing)) {
      actions.push({
        kind: 'rm',
        path: spec.path,
        note: `${spec.path} (stale agent contract — ${cause})`,
      });
    } else if (hasMarker(existing)) {
      actions.push({
        kind: 'instruct',
        note: `${spec.path} is no longer among the emitted agent contracts (${cause}) but carries hand-written content around its BLUEPRINT block — remove the block (or the file) yourself if it is unwanted.`,
      });
    }
  }

  return actions;
}

/** Regenerate init's own config, hand over a reference, or write a fresh one. */
function eslintConfigActions(blueprint: Blueprint, state: ProjectState): Action[] {
  // The existing config carries the blueprint banner — it is init's own
  // output, so regenerate it in place instead of treating it as brownfield.
  if (state.ownedEslintConfig !== undefined) {
    return [{
      kind: 'write',
      path: state.ownedEslintConfig,
      content: eslintConfigSource(blueprint, state),
      note: `${state.ownedEslintConfig} (blueprint-owned — regenerated)`,
    }];
  }

  // The user's own config already imports the package — wired by its
  // owner. Nothing to hand off, and no reference to nag about.
  if (state.wiredEslintConfig) {
    return [{
      kind: 'instruct',
      note: 'eslint config already wires @kekkai/blueprint — nothing to merge.',
    }];
  }

  // A reference file to diff and merge from, never wired in. A legacy `.eslintrc*`
  // gets one too — a fresh flat config beside it would be two configs, two ledgers.
  if (state.hasEslintConfig || state.legacyEslintConfig !== undefined) {
    return [
      {
        kind: 'write',
        path: 'eslint.config.blueprint.mjs',
        content: eslintConfigSource(blueprint, state),
        note: 'eslint.config.blueprint.mjs (reference — not wired in)',
      },
      { kind: 'instruct', note: eslintWiringNote(state) },
    ];
  }

  return [{
    kind: 'write',
    path: 'eslint.config.mjs',
    content: eslintConfigSource(blueprint, state),
    note: 'eslint.config.mjs',
  }];
}

/**
 * The dependency install, or the command to run by hand. The anti-bypass guard
 * defaults to ADOPT, so its plugin ships on every path or the bold default hits
 * "Cannot find package" (field issue #9).
 */
function installActions(state: ProjectState, options: PlanOptions): Action[] {
  const deps = state.missingDeps;

  if (!deps.length) {
    return [];
  }

  // --no-install must not silently drop the requirement — surface the
  // exact command, or the install claim rings empty.
  if (options.install === false) {
    return [{
      kind: 'instruct',
      note: `Install skipped — run it yourself:\n    ${installCommand(state.packageManager, deps)}`,
    }];
  }

  return [{
    kind: 'install',
    command: installCommand(state.packageManager, deps),
    // Renders as "✓ install: <note>", so a note opening with "install" stutters
    // (field issue #34). Unpinned on purpose, and the range says so.
    //
    // Two facts, in this order. The peer-range half leads: it is checkable from
    // where the adopter stands, and `detect.test.ts` proves it per carrier. The
    // CI half names its channel rather than a bare "both tested" — the published
    // tarball's `devDependencies` carry eslint 9, and that claim beside a visible
    // `^9.39.2` is two true things with nothing bridging them (field run #150).
    note: deps.includes('eslint')
      ? `${deps.join(', ')} — eslint unpinned, resolving to the newest supported major (${SUPPORTED_ESLINT_MAJORS.join(' and ')} are both admitted by every carrier's peer range, and @kekkai/blueprint's CI runs its own suite on each)`
      : deps.join(', '),
  }];
}

/** Whether a file carries the generated block's opening marker. */
function hasMarker(text: string): boolean {
  return text.includes(`<!-- ${MARKER}:START -->`);
}

/**
 * Exactly one marker block with nothing outside it — wholly init's own
 * output, safe to remove. The lazy match stops at the FIRST end marker, so
 * any content after it (a second block, hand-written trailing notes) fails
 * the test and downgrades removal to an instruct.
 */
function isWhollyGenerated(text: string): boolean {
  return new RegExp(
    `^<!-- ${MARKER}:START -->[\\s\\S]*?<!-- ${MARKER}:END -->$`,
  ).test(text.trim());
}

/** Merge the contract into a shared context file: refresh in place, append, or create. */
function mergeContract(existing: string | null, contract: string): string {
  const body = contract.trimEnd();

  // Hand-written files (no marker) never reach here — the plan loop routes
  // them to a reference file instead, so this only creates or refreshes.
  if (existing === null) {
    return [`<!-- ${MARKER}:START -->`, body, `<!-- ${MARKER}:END -->`, ''].join('\n');
  }

  return injectBetweenMarkers(existing, MARKER, body);
}

/**
 * How this repo runs a package script. Its sibling below builds the install command
 * from the same detected fact, and the emitted contract used to hardcode `npm run
 * lint` beside it — init detecting `pnpm`, installing with `pnpm add`, and then
 * telling the next agent to run npm (field run #141). The two emitters that carry
 * that sentence cannot see the repo by design, so they name no runner at all; this
 * is for the playbook, which is written by a runtime that can.
 */
export function scriptCommand(pm: PackageManager, script: string): string {
  return pm === 'npm' ? `npm run ${script}` : `${pm} ${script}`;
}

export function installCommand(pm: PackageManager, deps: string[]): string {
  const list = deps.join(' ');

  if (pm === 'npm') {
    return `npm install -D ${list}`;
  }

  return `${pm} add -D ${list}`;
}
