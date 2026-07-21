import { aliasActions } from './alias';
import { emitAgentFiles } from '../emit/agent';
import { emitCi } from '../emit/ci';
import { emitHandbook, handbookPath } from '../emit/docs';
import { injectBetweenMarkers } from '../markdown';
import type { AgentTarget, Blueprint, RuleSetting } from '../config';
import { GENERATED_ESLINT_BANNER } from '../project';
import type { PackageManager, ProjectState } from '../project';
import type { Action } from './types';

const MARKER = 'BLUEPRINT';

export interface PlanOptions {
  /** Skip the install action when false. */
  install?: boolean;
  /** Existing content of merge-strategy agent files, keyed by their resolved path. */
  existingAgentFiles?: Record<string, string | null>;
  /** Narrow the default contract targets to the one tool in use (`--agent`). */
  agentTarget?: AgentTarget;
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

  const handbook = handbookPath(blueprint);

  actions.push({ kind: 'write', path: handbook, content: emitHandbook(blueprint), note: handbook });

  const targets = options.agentTarget ? [options.agentTarget] : undefined;

  for (const file of emitAgentFiles(blueprint, targets)) {
    if (file.strategy === 'merge') {
      const existing = options.existingAgentFiles?.[file.path] ?? null;

      // A hand-written file that already mentions the package has been
      // integrated by its owner — symmetric with the wired eslint config.
      if (
        existing !== null
        && !existing.includes(`<!-- ${MARKER}:START -->`)
        && existing.includes('@kekkai/blueprint')
      ) {
        actions.push({
          kind: 'instruct',
          note: `${file.path} already integrates the blueprint contract — left as is.`,
        });

        continue;
      }

      // A hand-written context file (no marker block) is a document someone
      // maintains — appending a generated block to it is not a merge, it is
      // graffiti. Leave a reference next to it instead; a person (or the
      // authoring agent, as its final step) integrates it in the document's
      // own structure.
      if (existing !== null && !existing.includes(`<!-- ${MARKER}:START -->`)) {
        const reference = file.path.replace(/\.md$/, '.blueprint.md');

        actions.push(
          {
            kind: 'write',
            path: reference,
            content: file.content,
            note: `${reference} (reference — hand-written ${file.path} left untouched)`,
          },
          {
            kind: 'instruct',
            note: `${file.path} is hand-written, so it was not touched. Integrate ${reference} into it — follow the document's own structure, link rather than duplicate — then delete the reference. (An agent running the authoring playbook does this as its final step.)`,
          },
        );

        continue;
      }

      actions.push({
        kind: 'write',
        path: file.path,
        content: mergeContract(existing, file.content),
        note: `${file.path} (agent contract)`,
      });

      continue;
    }

    actions.push({ kind: 'write', path: file.path, content: file.content, note: `${file.path} (agent contract)` });
  }

  if (state.ownedEslintConfig !== undefined) {
    // The existing config carries the blueprint banner — it is init's own
    // output, so regenerate it in place instead of treating it as brownfield.
    actions.push({
      kind: 'write',
      path: state.ownedEslintConfig,
      content: eslintConfigSource(blueprint, state),
      note: `${state.ownedEslintConfig} (blueprint-owned — regenerated)`,
    });
  } else if (state.wiredEslintConfig) {
    // The user's own config already imports the package — wired by its
    // owner. Nothing to hand off, and no reference to nag about.
    actions.push({
      kind: 'instruct',
      note: 'eslint config already wires @kekkai/blueprint — nothing to merge.',
    });
  } else if (state.hasEslintConfig) {
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
      note: 'eslint.config already exists — blueprint never edits it, so the reference file is your merge source, not a keepsake. Wire it in (the authoring playbook makes an agent do exactly this):\n    diff eslint.config.blueprint.mjs eslint.config.*   # see what blueprint adds\n  Spread the blueprint rules into your existing config:\n    import blueprint from \'./blueprint.config.mjs\';\n    import { emitLint } from \'@kekkai/blueprint\';\n    export default [ ...emitLint(blueprint), /* …your existing entries */ ];\n  On a TypeScript project pass the TS plugin — emitLint(blueprint, { typescript: tseslint.plugin }).\n  Resolve rule conflicts explicitly, run your own lint, then DELETE the reference —\n  adoption is not done while it remains. (Legacy .eslintrc configs need a flat-config\n  migration first — decide that consciously, not as a side effect.)',
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

  actions.push(...aliasActions(state, architecture, configSource !== null));

  return actions;
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
    GENERATED_ESLINT_BANNER,
    '// Only this generated file is regenerated (this banner marks it as',
    '// blueprint-owned) — a hand-written eslint config is never overwritten.',
    '// Keep custom entries in your own config and spread ...emitLint(blueprint)',
    '// there instead of editing this file.',
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

export function installCommand(pm: PackageManager, deps: string[]): string {
  const list = deps.join(' ');

  if (pm === 'npm') return `npm install -D ${list}`;

  return `${pm} add -D ${list}`;
}
