import { aliasActions } from './alias';
import { emitAgentFiles } from '../emit/agent';
import { emitCi } from '../emit/ci';
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
    // Copy-ready hand-off: the full generated config lands next to the user's
    // own as a reference file they can diff and merge from — never wired in.
    actions.push({
      kind: 'write',
      path: 'eslint.config.blueprint.mjs',
      content: eslintConfigSource(blueprint, state),
      note: 'eslint.config.blueprint.mjs (reference — not wired in)',
    });

    actions.push({
      kind: 'instruct',
      note: 'eslint.config already exists, so it was not touched. Merge from the reference file:\n    diff eslint.config.blueprint.mjs eslint.config.*   # see what blueprint adds\n  Minimal merge — spread the blueprint rules into your existing config:\n    import blueprint from \'./blueprint.config.mjs\';\n    import { emitLint } from \'@kekkai/blueprint\';\n    export default [ ...emitLint(blueprint), /* …your existing entries */ ];\n  On a TypeScript project pass the TS plugin — emitLint(blueprint, { typescript: tseslint.plugin })\n  — so the unusedVars gate uses the TS-aware rule. Then copy the parser + CORE\n  blocks you need from the reference file, and delete it.',
    });
  } else {
    actions.push({
      kind: 'write',
      path: 'eslint.config.mjs',
      content: eslintConfigSource(blueprint, state),
      note: 'eslint.config.mjs',
    });
  }

  if (emit?.ci === 'github') {
    actions.push({
      kind: 'write',
      path: '.github/workflows/blueprint-ci.yml',
      content: emitCi(blueprint, { packageManager: state.packageManager }),
      note: '.github/workflows/blueprint-ci.yml',
    });
  }

  if (state.missingDeps.length) {
    if (options.install !== false) {
      actions.push({
        kind: 'install',
        command: installCommand(state.packageManager, state.missingDeps),
        note: `install ${state.missingDeps.join(', ')}`,
      });
    } else {
      // --no-install must not silently drop the requirement — surface the
      // exact command, or "init installs knip" becomes an empty claim.
      actions.push({
        kind: 'instruct',
        note: `Install skipped — run it yourself:\n    ${installCommand(state.packageManager, state.missingDeps)}`,
      });
    }
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
 * The generated flat config: parser wiring for the detected stack, the
 * blueprint-driven rules, and the handbook's third-party CORE block. Parsers
 * only — framework rule packs (eslint-plugin-vue, react-hooks…) stay the
 * user's choice. The library itself never depends on any of these packages —
 * they live in the scaffolded config, and init installs them as project deps.
 */
function eslintConfigSource(blueprint: Blueprint, state: ProjectState): string {
  const framework = blueprint.framework !== 'auto' ? blueprint.framework : state.framework;
  const vue = framework === 'vue';
  const ts = state.hasTypescript;
  const cycles = activeTier(blueprint.rules?.cycles);

  const parserImports = [
    ...(vue ? ['import vueParser from \'vue-eslint-parser\';'] : []),
    ...(ts ? ['import tseslint from \'typescript-eslint\';'] : []),
  ];

  const parserBlocks = [
    // Parsers only, so every file the rules cover can actually be parsed.
    ...(vue
      ? [
          '  {',
          '    files: [\'**/*.vue\'],',
          ts
            ? '    languageOptions: { parser: vueParser, parserOptions: { parser: tseslint.parser } },'
            : '    languageOptions: { parser: vueParser },',
          '  },',
        ]
      : []),
    ...(ts
      ? [
          '  {',
          '    files: [\'**/*.{ts,tsx,mts,cts}\'],',
          '    languageOptions: { parser: tseslint.parser },',
          '  },',
        ]
      : []),
    ...(framework === 'react'
      ? [
          '  {',
          '    files: [\'**/*.{js,jsx}\'],',
          '    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },',
          '  },',
        ]
      : []),
  ];

  const core = [
    ...(cycles ? [`      'import/no-cycle': ['${cycles}', { maxDepth: Infinity }],`] : []),
    // rules.deadCode deliberately emits no ESLint line: import/no-unused-modules
    // cannot run under flat config (import-js/eslint-plugin-import#3079) — dead
    // code is knip's job (installed by init) plus `blueprint inspect`.
    '      \'@eslint-community/eslint-comments/no-unlimited-disable\': \'error\',',
    '      \'@eslint-community/eslint-comments/require-description\': \'error\',',
  ];

  return [
    'import { emitLint } from \'@kekkai/blueprint\';',
    'import importPlugin from \'eslint-plugin-import\';',
    'import comments from \'@eslint-community/eslint-plugin-eslint-comments\';',
    ...parserImports,
    'import blueprint from \'./blueprint.config.mjs\';',
    '',
    'export default [',
    ...parserBlocks,
    // TS projects hand emitLint the @typescript-eslint plugin so the
    // unusedVars gate runs its TS-aware rule (core false-flags enum members).
    ts
      ? '  ...emitLint(blueprint, { typescript: tseslint.plugin }),'
      : '  ...emitLint(blueprint),',
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
