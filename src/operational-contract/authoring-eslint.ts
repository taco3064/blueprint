import type {
  EslintConfigSourceFact,
  FrameworkFact,
} from './authoring-types';

export function eslintConfigSource(facts: EslintConfigSourceFact): string {
  const {
    framework,
    generatedBanner,
    guardExtensions: guardExts,
    hasTypescript: ts,
    sourceRoot,
    basePath,
  } = facts;

  const guardRoot = sourceRoot === '.' ? '' : `${sourceRoot}/`;
  const parserBlocks = parserEntries(framework, ts, basePath);
  const blueprintConfig = basePath ? `./${basePath}/blueprint.config.mjs` : './blueprint.config.mjs';

  return [
    generatedBanner,
    '// Only this generated file is regenerated (this banner marks it as',
    '// blueprint-owned) — a hand-written eslint config is never overwritten.',
    '// Keep custom entries in your own config and spread ...emitLint(blueprint)',
    '// there instead of editing this file.',
    'import { emitLint } from \'@kekkai/blueprint\';',
    ...(basePath ? ['import { fileURLToPath } from \'node:url\';'] : []),
    'import comments from \'@eslint-community/eslint-plugin-eslint-comments\';',
    'import stylistic from \'@stylistic/eslint-plugin\';',
    'import imports from \'eslint-plugin-import-x\';',
    ...(framework === 'vue' ? ['import vueParser from \'vue-eslint-parser\';'] : []),
    ...(ts ? ['import tseslint from \'typescript-eslint\';'] : []),
    `import blueprint from '${blueprintConfig}';`,
    ...(basePath
      ? ['', `const applicationRoot = fileURLToPath(new URL('./${basePath}/', import.meta.url));`]
      : []),
    '',
    'export default [',
    ...(parserBlocks.length ? parserHeader(ts) : []),
    ...parserBlocks,

    ts
      ? `  ...emitLint(blueprint, { typescript: tseslint.plugin, stylistic, imports${basePath ? ', basePath: applicationRoot' : ''} }),`
      : `  ...emitLint(blueprint, { stylistic, imports${basePath ? ', basePath: applicationRoot' : ''} }),`,
    ...antiBypassGuard(guardExts, guardRoot, basePath),
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

function parserEntries(
  framework: FrameworkFact | null,
  ts: boolean,
  basePath?: string,
): string[] {
  const scope = basePath ? ['    basePath: applicationRoot,'] : [];

  return [
    ...(framework === 'vue'
      ? [
          '  {',
          ...scope,
          '    files: [\'**/*.vue\'],',
          ts
            ? '    languageOptions: { parser: vueParser, parserOptions: { parser: '
            + 'tseslint.parser, ecmaFeatures: { jsx: true } } },'
            : '    languageOptions: { parser: vueParser, '
              + 'parserOptions: { ecmaFeatures: { jsx: true } } },',
          '  },',
        ]
      : []),
    ...(ts
      ? [
          '  {',
          ...scope,
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
          ...scope,
          '    files: [\'**/*.{js,jsx}\'],',
          '    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },',
          '  },',
        ]
      : []),
  ];
}

function antiBypassGuard(guardExts: string, guardRoot: string, basePath?: string): string[] {
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
    ...(basePath ? ['    basePath: applicationRoot,'] : []),
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
