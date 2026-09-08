import path from 'node:path';

import { aliasActions } from './alias';
import { assertContained } from './contain';
import { defaultAgentPaths, emitAgentFiles } from '../emit/agent';
import type { AgentFile } from '../emit/agent';
import { emitHandbook, handbookPath } from '../emit/docs';
import { eslintConfigSource, eslintWiringNote } from './eslint';
import { injectBetweenMarkers } from '../markdown';
import { sourcePath } from '../config';
import type { AgentTarget, ArchitectureDef, Blueprint, EmitDef } from '../config';
import { SUPPORTED_ESLINT_MAJORS } from '../project';
import type { PackageManager, ProjectState } from '../project';
import type { Action } from './types';

const MARKER = 'BLUEPRINT';

export interface PlanOptions {

  configSource?: string | null;

  install?: boolean;

  existingAgentFiles?: Record<string, string | null>;

  agentTarget?: AgentTarget;

  hasSourceFiles?: boolean;
  existingSourceDirs?: string[];
}

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

export function plan(
  state: ProjectState,
  blueprint: Blueprint,
  options: PlanOptions = {},
): Action[] {
  const { architecture, emit } = blueprint;
  const { configSource = null } = options;
  const handbook = handbookPath(blueprint);

  const stack = { hasTypescript: state.hasTypescript };

  const agentFiles = emitAgentFiles(
    blueprint,
    options.agentTarget ? [options.agentTarget] : undefined,
    stack,
  );

  const actions: Action[] = [
    ...(configSource === null
      ? []
      : [configWrite(configSource)]),

    ...(options.hasSourceFiles
      ? []
      : scaffoldDirs(
          architecture,
          options.existingSourceDirs ?? state.existingSrcDirs,
        )),
    {
      kind: 'write',
      path: handbook,
      content: emitHandbook(blueprint, stack),
      note: handbook,
    },
    ...agentContractActions(agentFiles, options.existingAgentFiles),
    ...staleContractActions(agentFiles, emit, options),
    ...eslintConfigActions(blueprint, state),

    ...aliasActions(state, architecture, configSource !== null),
    ...installActions(state, options),
    ...TOOLING_NOTES,
  ];

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

function scaffoldDirs(architecture: ArchitectureDef, existing: string[]): Action[] {
  return architecture.layers
    .filter((layer) => !existing.includes(layer.name))
    .map((layer) => ({
      kind: 'mkdir',
      path: sourcePath(architecture, layer.name),
      note: `${sourcePath(architecture, layer.name)}/`,
    }));
}

function agentContractActions(
  files: AgentFile[],
  existingAgentFiles: Record<string, string | null> | undefined,
): Action[] {
  return files.flatMap((file) =>
    contractActions(file, existingAgentFiles?.[file.path] ?? null),
  );
}

function contractActions(file: AgentFile, existing: string | null): Action[] {
  if (file.strategy !== 'merge') {
    return [{
      kind: 'write',
      path: file.path,
      content: file.content,
      note: `${file.path} (agent contract)`,
    }];
  }

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

function referenceActions(file: AgentFile): Action[] {
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

function eslintConfigActions(blueprint: Blueprint, state: ProjectState): Action[] {
  if (state.ownedEslintConfig !== undefined) {
    return [{
      kind: 'write',
      path: state.ownedEslintConfig,
      content: eslintConfigSource(blueprint, state),
      note: `${state.ownedEslintConfig} (blueprint-owned — regenerated)`,
    }];
  }

  if (state.wiredEslintConfig) {
    return [{
      kind: 'instruct',
      note: 'eslint config already wires @kekkai/blueprint — nothing to merge.',
    }];
  }

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

function installActions(state: ProjectState, options: PlanOptions): Action[] {
  const deps = state.missingDeps;

  if (!deps.length) {
    return [];
  }

  if (options.install === false) {
    return [{
      kind: 'instruct',
      note: `Install skipped — run it yourself:\n    ${installCommand(state.packageManager, deps)}`,
    }];
  }

  return [{
    kind: 'install',
    command: installCommand(state.packageManager, deps),

    note: deps.includes('eslint')
      ? `${deps.join(', ')} — eslint unpinned, resolving to the newest supported major (${SUPPORTED_ESLINT_MAJORS.join(' and ')} are both admitted by every carrier's peer range, and @kekkai/blueprint's CI runs its own suite on each)`
      : deps.join(', '),
  }];
}

function hasMarker(text: string): boolean {
  return text.includes(`<!-- ${MARKER}:START -->`);
}

function isWhollyGenerated(text: string): boolean {
  return new RegExp(
    `^<!-- ${MARKER}:START -->[\\s\\S]*?<!-- ${MARKER}:END -->$`,
  ).test(text.trim());
}

function mergeContract(existing: string | null, contract: string): string {
  const body = contract.trimEnd();

  if (existing === null) {
    return [`<!-- ${MARKER}:START -->`, body, `<!-- ${MARKER}:END -->`, ''].join('\n');
  }

  return injectBetweenMarkers(existing, MARKER, body);
}

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
