import { aliasActions } from './alias';
import { emitAgentFiles } from '../emit/agent';
import { emitHandbook } from '../emit/docs';
import { injectBetweenMarkers } from '../markdown';
import type { Blueprint, RuleSetting } from '../config';
import type { PackageManager, ProjectState } from '../project';
import type { Action } from './types';

const MARKER = 'BLUEPRINT';
const DEFAULT_HANDBOOK = 'docs/architecture-handbook.md';

export interface PlanOptions {
  /** Skip the install action when false. */
  install?: boolean;
  /** Existing content of merge-strategy agent files, keyed by their resolved path. */
  existingAgentFiles?: Record<string, string | null>;
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

  for (const file of emitAgentFiles(blueprint)) {
    const content
      = file.strategy === 'merge'
        ? mergeContract(options.existingAgentFiles?.[file.path] ?? null, file.content)
        : file.content;

    actions.push({ kind: 'write', path: file.path, content, note: `${file.path} (agent contract)` });
  }

  if (state.hasEslintConfig) {
    actions.push({
      kind: 'instruct',
      note: 'eslint.config already exists — spread blueprint into it:\n    import blueprint from \'./blueprint.config.mjs\';\n    import { emitLint } from \'@kekkai/blueprint\';\n    export default [ ...emitLint(blueprint) ];\n  …and add the third-party CORE block (import/no-cycle, import/no-unused-modules, eslint-comments discipline) — compare a generated eslint.config.mjs.',
    });
  } else {
    actions.push({
      kind: 'write',
      path: 'eslint.config.mjs',
      content: eslintConfigSource(blueprint),
      note: 'eslint.config.mjs',
    });
  }

  if (options.install !== false && state.missingDeps.length) {
    actions.push({
      kind: 'install',
      command: installCommand(state.packageManager, state.missingDeps),
      note: `install ${state.missingDeps.join(', ')}`,
    });
  }

  actions.push(
    {
      kind: 'instruct',
      note: 'Dead code: `npx knip` is the source of truth for dead exports and files — `import/no-unused-modules` is only the warn-tier entry point.',
    },
    {
      kind: 'instruct',
      note: 'CSS token governance (optional): install stylelint + @csstools/stylelint-value-no-unknown-custom-properties, pointing importFrom at your token source file.',
    },
  );

  actions.push(...aliasActions(state, architecture));

  return actions;
}

/** Merge the contract into a shared context file: refresh in place, append, or create. */
function mergeContract(existing: string | null, contract: string): string {
  const body = contract.trimEnd();
  const block = [`<!-- ${MARKER}:START -->`, body, `<!-- ${MARKER}:END -->`].join('\n');

  if (existing === null) {
    return `${block}\n`;
  } else if (existing.includes(`<!-- ${MARKER}:START -->`)) {
    return injectBetweenMarkers(existing, MARKER, body);
  }

  return `${existing.trimEnd()}\n\n${block}\n`;
}

/**
 * The generated flat config: the blueprint-driven rules plus the handbook's
 * third-party CORE block. The library itself never depends on these plugins —
 * they live in the scaffolded config, and init installs them as project deps.
 */
function eslintConfigSource(blueprint: Blueprint): string {
  const cycles = activeTier(blueprint.rules?.cycles);
  const deadCode = activeTier(blueprint.rules?.deadCode);

  const core = [
    ...(cycles ? [`      'import/no-cycle': ['${cycles}', { maxDepth: Infinity }],`] : []),
    ...(deadCode
      ? ['      \'import/no-unused-modules\': [\'warn\', { unusedExports: true }], // knip is the source of truth']
      : []),
    '      \'@eslint-community/eslint-comments/no-unlimited-disable\': \'error\',',
    '      \'@eslint-community/eslint-comments/require-description\': \'error\',',
  ];

  return [
    'import { emitLint } from \'@kekkai/blueprint\';',
    'import importPlugin from \'eslint-plugin-import\';',
    'import comments from \'@eslint-community/eslint-plugin-eslint-comments\';',
    'import blueprint from \'./blueprint.config.mjs\';',
    '',
    'export default [',
    '  ...emitLint(blueprint),',
    '  {',
    '    files: [\'src/**/*.{js,jsx,ts,tsx,vue}\'],',
    '    plugins: {',
    '      import: importPlugin,',
    '      \'@eslint-community/eslint-comments\': comments,',
    '    },',
    '    rules: {',
    ...core,
    '    },',
    '  },',
    '];',
    '',
  ].join('\n');
}

/** A rule setting's active severity, or null when unset / `off`. */
function activeTier(setting: RuleSetting | undefined): string | null {
  if (!setting) return null;

  const tier = typeof setting === 'string' ? setting : setting.tier;

  return tier === 'off' ? null : tier;
}

function installCommand(pm: PackageManager, deps: string[]): string {
  const list = deps.join(' ');

  if (pm === 'npm') return `npm install -D ${list}`;

  return `${pm} add -D ${list}`;
}
