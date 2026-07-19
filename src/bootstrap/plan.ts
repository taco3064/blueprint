import { emitAgentContract } from '../emit/agent';
import { emitHandbook } from '../emit/docs';
import { injectBetweenMarkers } from '../markdown';
import type { Blueprint } from '../config/types';
import type { PackageManager, ProjectState } from '../project';
import type { Action } from './types';

const MARKER = 'BLUEPRINT';
const DEFAULT_HANDBOOK = 'docs/architecture-handbook.md';
const DEFAULT_CLAUDE_MD = 'CLAUDE.md';

export interface PlanOptions {
  /** Skip the install action when false. */
  install?: boolean;
}

/** Decide every effect `init` will perform. Pure — reads facts, returns actions. */
export function plan(
  state: ProjectState,
  blueprint: Blueprint,
  configSource: string | null,
  options: PlanOptions = {},
): Action[] {
  const { architecture, emit } = blueprint;
  const actions: Action[] = [];

  if (configSource !== null) {
    actions.push({ kind: 'write', path: 'blueprint.config.mjs', content: configSource, note: 'blueprint.config.mjs' });
  }

  for (const layer of architecture.layers) {
    if (!state.existingSrcDirs.includes(layer.name)) {
      actions.push({ kind: 'mkdir', path: `src/${layer.name}`, note: `src/${layer.name}/` });
    }
  }

  const handbookPath = emit?.handbook ?? DEFAULT_HANDBOOK;

  actions.push({ kind: 'write', path: handbookPath, content: emitHandbook(blueprint), note: handbookPath });

  const claudePath = emit?.claudeMd ?? DEFAULT_CLAUDE_MD;

  actions.push({
    kind: 'write',
    path: claudePath,
    content: claudeMdContent(state.claudeMd, emitAgentContract(blueprint)),
    note: `${claudePath} (agent contract)`,
  });

  if (state.hasEslintConfig) {
    actions.push({
      kind: 'instruct',
      note: 'eslint.config already exists — spread blueprint into it:\n    import blueprint from \'./blueprint.config.mjs\';\n    import { emitLint } from \'@kekkai/blueprint\';\n    export default [ ...emitLint(blueprint) ];',
    });
  } else {
    actions.push({ kind: 'write', path: 'eslint.config.mjs', content: eslintConfigSource(), note: 'eslint.config.mjs' });
  }

  if (options.install !== false && state.missingDeps.length) {
    actions.push({
      kind: 'install',
      command: installCommand(state.packageManager, state.missingDeps),
      note: `install ${state.missingDeps.join(', ')}`,
    });
  }

  actions.push({
    kind: 'instruct',
    note: `Set the import alias "${architecture.alias}" in your bundler / tsconfig — the lint rules resolve against it.`,
  });

  return actions;
}

/** Merge the agent contract into CLAUDE.md: refresh in place, append, or create. */
function claudeMdContent(existing: string | null, contract: string): string {
  const body = contract.trimEnd();
  const block = [`<!-- ${MARKER}:START -->`, body, `<!-- ${MARKER}:END -->`].join('\n');

  if (existing === null) {
    return `${block}\n`;
  } else if (existing.includes(`<!-- ${MARKER}:START -->`)) {
    return injectBetweenMarkers(existing, MARKER, body);
  }

  return `${existing.trimEnd()}\n\n${block}\n`;
}

/** A minimal flat config that spreads the structural rules; users add their base. */
function eslintConfigSource(): string {
  return [
    'import { emitLint } from \'@kekkai/blueprint\';',
    'import blueprint from \'./blueprint.config.mjs\';',
    '',
    'export default [',
    '  ...emitLint(blueprint),',
    '];',
    '',
  ].join('\n');
}

function installCommand(pm: PackageManager, deps: string[]): string {
  const list = deps.join(' ');

  if (pm === 'npm') return `npm install -D ${list}`;

  return `${pm} add -D ${list}`;
}
