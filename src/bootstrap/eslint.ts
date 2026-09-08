import { FRAMEWORK_EXTS } from '../emit/lint';
import { resolveArchitecture } from '../config';
import type { Blueprint, Framework } from '../config';
import { GENERATED_ESLINT_BANNER } from '../project';
import type { ProjectState } from '../project';

export function eslintConfigSource(blueprint: Blueprint, state: ProjectState): string {
  const framework = blueprint.framework !== 'auto' ? blueprint.framework : state.framework;
  const ts = state.hasTypescript;

  const guardExts = framework ? FRAMEWORK_EXTS[framework] : FRAMEWORK_EXTS.auto;
  const sourceRoot = resolveArchitecture(blueprint.architecture).sourceRoot;
  const guardRoot = sourceRoot === '.' ? '' : `${sourceRoot}/`;
  const parserBlocks = parserEntries(framework, ts);

  return [
    GENERATED_ESLINT_BANNER,
    '// Only this generated file is regenerated (this banner marks it as',
    '// blueprint-owned) — a hand-written eslint config is never overwritten.',
    '// Keep custom entries in your own config and spread ...emitLint(blueprint)',
    '// there instead of editing this file.',
    'import { emitLint } from \'@kekkai/blueprint\';',
    'import comments from \'@eslint-community/eslint-plugin-eslint-comments\';',
    'import stylistic from \'@stylistic/eslint-plugin\';',
    'import imports from \'eslint-plugin-import-x\';',
    ...(framework === 'vue' ? ['import vueParser from \'vue-eslint-parser\';'] : []),
    ...(ts ? ['import tseslint from \'typescript-eslint\';'] : []),
    'import blueprint from \'./blueprint.config.mjs\';',
    '',
    'export default [',
    ...(parserBlocks.length ? parserHeader(ts) : []),
    ...parserBlocks,

    ts
      ? '  ...emitLint(blueprint, { typescript: tseslint.plugin, stylistic, imports }),'
      : '  ...emitLint(blueprint, { stylistic, imports }),',
    ...antiBypassGuard(guardExts, guardRoot),
    '];',
    '',
  ].join('\n');
}

function parserHeader(ts: boolean): string[] {
  return [
    '  // Parser setup — needed when THIS file is the live config. Merging',
    '  // into an existing config that already wires parsers? Skip these',
    '  // blocks — copying them re-parses files your config already handles.',
    '  // A skipped block leaves its parser package installed: leave it — a',
    '  // later init treats it as required for the stack and re-installs it.',

    ...(ts
      ? [
          '  // "Already wires" includes presets that do it internally: extending',
          '  // tseslint.configs.recommended (or any typescript-eslint preset)',
          '  // means the TS parser is wired even if no languageOptions.parser',
          '  // line is visible. Your own lint passing on .ts/.tsx confirms it —',
          '  // as far as the files it actually parsed. On a repo whose layers hold',
          '  // no files yet, a green lint proves this config loads, not that the',
          '  // parser reaches layer files; it becomes that proof with the first',
          '  // file in a layer. Skipping the block is still right either way: a',
          '  // parser wired for the stack is wired for files that do not exist yet.',
        ]
      : []),
  ];
}

function parserEntries(framework: Framework | null, ts: boolean): string[] {
  return [
    ...(framework === 'vue'
      ? [
          '  {',
          '    files: [\'**/*.vue\'],',
          ts
            ? '    languageOptions: { parser: vueParser, parserOptions: { parser: '
            + 'tseslint.parser } },'
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

          '  // This jsx block matters only while .js/.jsx source exists — on a',
          '  // TS-only repo it is dormant, and skipping it in a merge loses nothing.',
          '  {',
          '    files: [\'**/*.{js,jsx}\'],',
          '    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },',
          '  },',
        ]
      : []),
  ];
}

function antiBypassGuard(guardExts: string, guardRoot: string): string[] {
  return [
    '  // The anti-bypass guard — NOT part of emitLint. A silent, unexplained',
    '  // eslint-disable is exactly how an agent routes around every rule',
    '  // above, so these two rules force each disable to carry a scope and a',
    '  // -- reason. Default: ADOPT. On a brownfield config, annotate the',
    '  // existing bare disables (or ledger them via --suppress-all) rather',
    '  // than dropping the block; dropping is the exception — only when the',
    '  // team already owns a disable discipline, and say so in the report.',
    '  // Its plugin (@eslint-community/eslint-plugin-eslint-comments) is',
    '  // installed by init on every path; dropping the block? Remove that',
    '  // dependency with it. When merging, its position relative to the',
    '  // emitLint spread does not matter — the rule sets never intersect.',
    ...(guardExts.includes('vue')
      ? [
          '  // Scope: JS/TS disable comments only — Vue template <!-- eslint-disable -->',
          '  // directives are not gated by these rules.',
        ]
      : []),
    '  {',
    `    files: ['${guardRoot}**/*.{${guardExts}}'],`,
    '    plugins: {',
    '      \'@eslint-community/eslint-comments\': comments,',
    '    },',
    '    rules: {',
    '      \'@eslint-community/eslint-comments/no-unlimited-disable\': \'error\',',
    '      \'@eslint-community/eslint-comments/require-description\': \'error\',',
    '    },',
    '  },',
  ];
}

export function eslintWiringNote(state: ProjectState): string {
  if (state.eslintConfigShape === 'legacy') {
    return `${state.legacyEslintConfig} is a legacy (non-flat) eslint config. Wiring the `
      + 'blueprint rules needs a flat-config / ESLint-9 migration first — that can break your '
      + 'lint pipeline, so it is a deliberate decision, not a side effect of adoption. Until you '
      + 'migrate, `blueprint inspect --baseline` already gates the architecture without touching '
      + 'eslint. Once on flat config, spread `...emitLint(blueprint)` from '
      + 'eslint.config.blueprint.mjs.\n'
      + sharedWiringTail(state);
  }

  if (state.eslintConfigShape === 'tseslint') {
    return 'Your eslint config uses `tseslint.config()`. Wire blueprint in by wrapping the spread '
      + '(eslint.config.blueprint.mjs is your merge source):\n'
      + '    import blueprint from \'./blueprint.config.mjs\';\n'
      + '    import { emitLint } from \'@kekkai/blueprint\';\n'
      + '    import stylistic from \'@stylistic/eslint-plugin\';\n'
      + '    import imports from \'eslint-plugin-import-x\';\n'
      + '    export default tseslint.config(\n'
      + '      /* …your existing configs */\n'

      + `      ...emitLint(blueprint, ${lintOptions(true)}),\n`
      + '    );\n'
      + '  emitLint goes LAST of the configs you already have — later entries win in flat\n'
      + '  config, so this keeps the blueprint\'s per-layer tuning alive over broad presets.\n'
      + '  Rules BOTH sides set (no-restricted-*) still need combining into ONE entry, and\n'
      + '  that combined entry is the one thing that goes after the spread.\n'
      + INJECT_NOTE
      + sharedWiringTail(state);
  }

  const spread = (state.hasTypescript ? '    import tseslint from \'typescript-eslint\';\n' : '')
    + '    import stylistic from \'@stylistic/eslint-plugin\';\n'
    + '    import imports from \'eslint-plugin-import-x\';\n'
    + '    export default [ /* …your existing entries */ '
    + `...emitLint(blueprint, ${lintOptions(state.hasTypescript)}) ];\n`;

  return 'eslint.config already exists — blueprint never edits it, so eslint.config.blueprint.mjs '
    + 'is your merge source, not a keepsake. Diff it, '
    + 'then spread the rules into your flat config:\n'
    + '    import blueprint from \'./blueprint.config.mjs\';\n'
    + '    import { emitLint } from \'@kekkai/blueprint\';\n'
    + spread
    + '  emitLint goes LAST of the configs you already have — later entries win in\n'
    + '  flat config, so this keeps the blueprint\'s per-layer tuning alive over broad\n'
    + '  presets. A `defineConfig([...])` wrapper takes the same spread, and its array\n'
    + '  IS the flat-config array. Rules BOTH sides set (no-restricted-*) still need\n'
    + '  combining into ONE entry, and that combined entry is the one thing that goes\n'
    + `  after the spread.${state.hasTypescript
      ? ''
      : ' On a TypeScript\n  project add the TS plugin too — emitLint(blueprint, { typescript: tseslint.plugin, stylistic, imports }).'}\n`
      + INJECT_NOTE
      + sharedWiringTail(state);
}

function lintOptions(ts: boolean): string {
  return ts ? '{ typescript: tseslint.plugin, stylistic, imports }' : '{ stylistic, imports }';
}

const INJECT_NOTE = '  Carry that options object over WHOLE. Three plugins are injected, never\n'
  + '  library deps: stylistic carries codeStyle / statementsPerLine /\n'
  + '  statementPadding, imports carries importBlock, and the TS one carries\n'
  + '  explicitAny. A gate whose plugin is absent emits NOTHING while lint still\n'
  + '  passes — dropping an argument looks exactly like a clean merge.\n';

function sharedWiringTail(state: ProjectState): string {
  const ts7016 = state.eslintConfigFile?.endsWith('.ts')
    ? '  Your config file is TypeScript: importing ./blueprint.config.mjs trips TS7016\n'
    + '  when the tsconfig covering it lacks allowJs — add `allowJs: true` to that\n'
    + '  tsconfig (often tsconfig.node.json), or ship a one-line blueprint.config.d.mts\n'
    + '  declaring the default export as Blueprint. Name the choice in your report.\n'
    : '';

  return `${ts7016}  An entry is more than its selectors: whatever you combine needs the emitted\n`
    + '  block\'s `ignores` too (every structural entry exempts the test files those\n'
    + '  globs reach, and a rebuilt entry has none unless you write one).\n'
    + '  `npx blueprint rules --json` carries both — selectors and their\n'
    + '  `testExemptions`. Doctor compares selectors, not scope, so a missing exemption\n'
    + '  stays green here and governs the test files those globs reach, which it was\n'
    + '  never meant to.\n'
    + '  Resolve rule conflicts explicitly, run your own lint, then DELETE the reference —\n'
    + '  adoption is not done while it remains.';
}
