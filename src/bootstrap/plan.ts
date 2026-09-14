import path from 'node:path';

import { aliasActions } from './alias';
import { assertContained } from './contain';
import { defaultAgentPaths, emitAgentFiles } from '../emit/agent';
import type { AgentFile } from '../emit/agent';
import { emitHandbook, handbookPath } from '../emit/docs';
import { eslintConfigSource } from './eslint';
import { injectBetweenMarkers } from '../markdown';
import { resolveArchitecture, sourcePath } from '../config';
import type { AgentTarget, ArchitectureDef, Blueprint, EmitDef } from '../config';
import { SUPPORTED_ESLINT_MAJORS } from '../project';
import type { PackageManager, ProjectState } from '../project';
import type { Action } from './types';
import {
  renderAgentContractNote,
  renderBlueprintConfigNote,
  renderDependencyInstallNote,
  renderEslintConfigNote,
  renderEslintWiringNote,
  renderHandbookWriteNote,
  renderInstallSkippedForPlan,
  renderIntegratedContractInstruction,
  renderLayerDirectoryNote,
  renderOptionalToolingNote,
  renderReferenceContractInstruction,
  renderReferenceContractNote,
  renderStaleContractInstruction,
  renderStaleContractNote,
  renderStaleContractCause,
  renderValidationErrorCause,
} from '../operational-contract';
import type { StaleContractCause } from '../operational-contract';

const MARKER = 'BLUEPRINT';

export interface PlanOptions {

  configSource?: string | null;

  install?: boolean;

  existingAgentFiles?: Record<string, string | null>;

  agentTarget?: AgentTarget;

  hasSourceFiles?: boolean;
  existingSourceDirs?: string[];
  lintIntegration?: 'verified' | 'unverified' | 'reference-only';
}

const TOOLING_NOTES: Action[] = [
  {
    kind: 'instruct',
    note: renderOptionalToolingNote('dead-code'),
  },
  {
    kind: 'instruct',
    note: renderOptionalToolingNote('css-tokens'),
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

  const stack = {
    hasTypescript: state.hasTypescript,
    lintIntegration: options.lintIntegration ?? lintIntegrationOf(state),
  };

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
      note: renderHandbookWriteNote(handbook),
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

function lintIntegrationOf(
  state: ProjectState,
): 'unverified' | 'reference-only' {
  return state.ownedEslintConfig !== undefined || state.wiredEslintConfig
    || (!state.hasEslintConfig && state.legacyEslintConfig === undefined)
    ? 'unverified'
    : 'reference-only';
}

function configWrite(configSource: string): Action {
  return {
    kind: 'write',
    path: 'blueprint.config.mjs',
    content: configSource,
    note: renderBlueprintConfigNote(),
  };
}

function scaffoldDirs(architecture: ArchitectureDef, existing: string[]): Action[] {
  const resolved = resolveArchitecture(architecture);

  if (resolved.topology === 'module-first') {
    return [];
  }

  return resolved.layers
    .filter((layer) => !existing.includes(layer.name))
    .map((layer) => ({
      kind: 'mkdir',
      path: sourcePath(architecture, layer.name),
      note: renderLayerDirectoryNote(sourcePath(architecture, layer.name)),
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
      note: renderAgentContractNote(file.path),
    }];
  }

  if (existing !== null && !hasMarker(existing) && existing.includes('@kekkai/blueprint')) {
    return [{
      kind: 'instruct',
      note: renderIntegratedContractInstruction(file.path, MARKER),
    }];
  }

  if (existing !== null && !hasMarker(existing)) {
    return referenceActions(file);
  }

  return [{
    kind: 'write',
    path: file.path,
    content: mergeContract(existing, file.content),
    note: renderAgentContractNote(file.path),
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
      note: renderReferenceContractNote(reference, file.path),
    },
    {
      kind: 'instruct',
      note: renderReferenceContractInstruction(file.path, reference, MARKER),
    },
  ];
}

function staleContractActions(
  files: AgentFile[],
  emit: EmitDef | undefined,
  options: PlanOptions,
): Action[] {
  const emitted = new Set(files.map((file) => file.path));

  const cause: StaleContractCause
    = emit?.agents !== undefined
      ? 'configured-policy'
      : options.agentTarget !== undefined
        ? 'agent-flag'
        : 'default-targets';

  const causeText = renderStaleContractCause(cause);

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
        note: renderStaleContractNote(spec.path, causeText),
      });
    } else if (hasMarker(existing)) {
      actions.push({
        kind: 'instruct',
        note: renderStaleContractInstruction(spec.path, causeText),
      });
    }
  }

  return actions;
}

function eslintConfigActions(blueprint: Blueprint, state: ProjectState): Action[] {
  const removeShadow: Action[] = state.shadowedEslintConfig === undefined
    ? []
    : [{
        kind: 'rm',
        path: state.shadowedEslintConfig,
        note: renderEslintConfigNote('shadow', state.shadowedEslintConfig),
      }];

  if (state.ownedEslintConfig !== undefined) {
    return [...removeShadow, {
      kind: 'write',
      path: state.ownedEslintConfig,
      content: eslintConfigSource(blueprint, state),
      note: renderEslintConfigNote('owned', state.ownedEslintConfig),
    }];
  }

  if (state.wiredEslintConfig) {
    return [...removeShadow, {
      kind: 'instruct',
      note: renderEslintConfigNote('wired', ''),
    }];
  }

  if (state.hasEslintConfig || state.legacyEslintConfig !== undefined) {
    return [
      ...removeShadow,
      {
        kind: 'write',
        path: 'eslint.config.blueprint.mjs',
        content: eslintConfigSource(blueprint, state),
        note: renderEslintConfigNote('reference', 'eslint.config.blueprint.mjs'),
      },
      { kind: 'instruct', note: renderEslintWiringNote({
        shape: state.eslintConfigShape ?? null,
        legacyFile: state.legacyEslintConfig,
        configFile: state.eslintConfigFile,
        hasTypescript: state.hasTypescript,
        basePath: state.eslintBasePath,
      }) },
    ];
  }

  return [...removeShadow, {
    kind: 'write',
    path: 'eslint.config.mjs',
    content: eslintConfigSource(blueprint, state),
    note: renderEslintConfigNote('new', 'eslint.config.mjs'),
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
      note: renderInstallSkippedForPlan(installCommand(state.packageManager, deps)),
    }];
  }

  return [{
    kind: 'install',
    command: installCommand(state.packageManager, deps),

    note: renderDependencyInstallNote(deps, SUPPORTED_ESLINT_MAJORS),
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

  try {
    return injectBetweenMarkers(existing, MARKER, body);
  } catch (error) {
    throw new Error(renderValidationErrorCause(error));
  }
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
