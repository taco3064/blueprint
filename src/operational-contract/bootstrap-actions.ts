import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';
import { renderTestFilesOperational } from './test-files';

export function renderJsconfigAliasNote(): OperationalText {
  return operationalText('jsconfig.json (import alias)');
}

export function renderHandbookWriteNote(path: string): OperationalText {
  return operationalText(path);
}

export function renderBlueprintConfigNote(): OperationalText {
  return operationalText('blueprint.config.mjs');
}

export function renderLayerDirectoryNote(path: string): OperationalText {
  return operationalText(`${path}/`);
}

export function renderInstallNote(): OperationalText {
  return operationalText('@kekkai/blueprint (the config imports it)');
}

export function renderInstallSkipped(command: string): OperationalText {
  return operationalText(`Install skipped — verification requires @kekkai/blueprint, so run:\n    ${command}`);
}

export function renderAuthoringInstallSkipped(command: string): OperationalText {
  return operationalText(`Install skipped — the config imports @kekkai/blueprint, so run it before authoring:\n    ${command}`);
}

export function renderAuthoringPlaybookNote(file: string): OperationalText {
  return operationalText(`${file} (authoring playbook + survey evidence)`);
}

export function renderAuthoringLauncherNote(file: string): OperationalText {
  return operationalText(`${file} (/blueprint-author)`);
}

export function renderLegacyCheckpointNote(path: string, backup = false): OperationalText {
  return operationalText(backup
    ? `${path} (original config preserved byte-for-byte before rewriting; includes comments and retired declarations. architecture.module.private has no 4.0 replacement: review the original policy before claiming equivalent governance)`
    : `${path} (Blueprint 3.2 → 4.0 layer-first checkpoint)`);
}

export function renderScaffoldRemovalNote(file: string): OperationalText {
  return operationalText(`${file} (pristine preset scaffold — removed; the playbook authors the real one)`);
}

export function renderOptionalToolingNote(
  kind: 'dead-code' | 'css-tokens',
): OperationalText {
  return operationalText(kind === 'dead-code'
    ? 'Dead code (optional): install knip and configure its entry points — it is the '
    + 'source of truth for dead files and exports, not `blueprint inspect` or the '
    + 'warn-tier `import/no-unused-modules`.'
    : 'CSS token governance (optional): install stylelint + '
      + '@csstools/stylelint-value-no-unknown-custom-properties, '
      + 'pointing importFrom at your token source file.');
}

export function renderAgentContractNote(path: string): OperationalText {
  return operationalText(`${path} (agent contract)`);
}

export function renderReferenceContractNote(reference: string, target: string): OperationalText {
  return operationalText(`${reference} (reference — hand-written ${target} left untouched)`);
}

export function renderReferenceContractInstruction(
  target: string,
  reference: string,
  marker: string,
): OperationalText {
  return operationalText(`${target} is hand-written, so it was not touched. Integrate ${reference} into it — `
    + 'follow the document\'s own structure, link rather than duplicate, and KEEP the '
    + `<!-- ${marker}:START/END --> marker comments around the generated block: they are what `
    + 'lets a later init refresh the block after config changes (integrating without them '
    + 'means updating it by hand, forever) — then delete the reference. (An agent running '
    + 'the authoring playbook does this as its final step.)');
}

export function renderStaleContractNote(path: string, cause: string): OperationalText {
  return operationalText(`${path} (stale agent contract — ${cause})`);
}

export function renderStaleContractInstruction(path: string, cause: string): OperationalText {
  return operationalText(`${path} is no longer among the emitted agent contracts (${cause}) but carries `
    + 'hand-written content around its BLUEPRINT block — remove the block (or the file) '
    + 'yourself if it is unwanted.');
}

export function renderEslintConfigNote(
  kind: 'owned' | 'wired' | 'reference' | 'new' | 'shadow',
  path: string,
): OperationalText {
  if (kind === 'owned') {
    return operationalText(`${path} (blueprint-owned — regenerated)`);
  }

  if (kind === 'wired') {
    return operationalText('eslint config already wires @kekkai/blueprint — nothing to merge.');
  }

  if (kind === 'reference') {
    return operationalText(`${path} (reference — not wired in)`);
  }

  if (kind === 'shadow') {
    return operationalText(`${path} (removed — generated nested config shadowed the ancestor eslint policy)`);
  }

  return operationalText(path);
}

export function renderInstallSkippedForPlan(command: string): OperationalText {
  return operationalText(`Install skipped — run it yourself:\n    ${command}`);
}

export function renderDependencyInstallNote(
  dependencies: string[],
  eslintMajors: readonly number[],
): OperationalText {
  return operationalText(dependencies.includes('eslint')
    ? `${dependencies.join(', ')} — eslint unpinned, resolving to the newest supported major `
    + `(${eslintMajors.join(' and ')} are both admitted by every carrier's peer range, and `
    + '@kekkai/blueprint\'s CI runs its own suite on each). That covers the carriers this '
    + 'install adds, not @kekkai/blueprint\'s own parser dependencies: your package manager '
    + 'may name those as unmet peers when it resolves the newest major. The emitted rules are '
    + 'unaffected — pin eslint to the older major if you would rather not see it.'
    : dependencies.join(', '));
}

export function renderIntegratedContractInstruction(path: string, marker: string): OperationalText {
  return operationalText(`${path} already integrates the blueprint contract without markers — left as is, `
    + 'and init can never refresh it: after config changes, update it by hand — or wrap the '
    + `generated block in <!-- ${marker}:START --> / <!-- ${marker}:END --> once, and every `
    + 'later init rewrites just that block.');
}

export function renderAliasAddedNote(file: string): OperationalText {
  return operationalText(`${file} (import alias added — existing content preserved)`);
}

export function renderTsconfigAliasInstruction(file: string, paths: string): OperationalText {
  return operationalText(`Add the import alias to ${file} under compilerOptions:\n    "paths": ${paths}\n  (no "baseUrl" needed — modern TypeScript resolves paths without it, and it is deprecated in 7.0)`);
}

export function renderBundlerAliasInstruction(alias: string): OperationalText {
  return operationalText(`Set the import alias "${alias}" in your bundler — the lint rules resolve against it.`);
}

export function renderViteAliasInstruction(file: string, aliases: string): OperationalText {
  return operationalText(`Add the alias to ${file} under resolve.alias:\n    resolve: { alias: { ${aliases} } }\n  (if this application config delegates to workspace Vite configuration, verify the alias there; already bridging tsconfig paths into Vite — e.g. vite-tsconfig-paths? Then the tsconfig side covers the bundler and this step is done.)`);
}

export function renderFirstAliasNote(facts: {
  alias: string;
  unreadable?: string;
}): OperationalText {
  return operationalText(`The preset introduced "${facts.alias}" as this repo's first import alias. The tilde is deliberate — '@' is npm's scope sigil (@vue/*, @types/*), and an app alias that does not look like a package scope stays visually distinct. Keep it unless the team already has its own alias convention (then set the preset's alias option and re-run init).${facts.unreadable
    ? ` Note that ${facts.unreadable}, so "first" is read from the configs that could be: if an alias is declared in there, fix that file and re-run init before keeping this one.`
    : ''}`);
}

export function renderDefaultAgentContractsNote(): OperationalText {
  return operationalText(
    'Wrote both CLAUDE.md and AGENTS.md (the default set) — declare emit.agents in '
    + 'blueprint.config.mjs, or re-run init with --agent claude|codex, to emit only the tool '
    + 'you actually use.',
  );
}

export function renderCodeStyleNote(): OperationalText {
  return operationalText('The preset turned `codeStyle` on at error tier: it pins indent (2), '
    + 'quotes (single), '
    + 'semicolons (required) and line width (90) across ~68 rules. Nearly all are auto-fixable, '
    + 'so when there IS code inside a layer, run `npx eslint . --fix` once and land that pass as '
    + 'its own commit — the formatting churn never mixes with a real change. While the layers '
    + 'are still empty that pass is a no-op: the gate reaches only files an architecture glob '
    + 'matches, and a starter\'s root files sit outside every one of them. It exempts nothing by '
    + 'style either: a starter written without semicolons is silent today and fails the day its '
    + 'first file moves into a layer, which is when the --fix pass earns its commit. Already have '
    + 'a formatter you trust? Set `codeStyle: \'off\'` in the config and keep yours — blueprint '
    + 'does not need it to enforce structure.');
}

export function renderGitignoreNote(entries: string, count: number): OperationalText {
  return operationalText(`.gitignore (re-included ${entries} — via !; delete the appended lines to keep ${count === 1 ? 'it' : 'them'} hidden; if a parent directory is wholly excluded, git needs that directory re-included too)`);
}

export function renderTemplateCleanupNote(findings: string[], more: number): OperationalText {
  return operationalText([
    `Template cleanup: the starter code violates the blueprint out of the box (${findings.length + more} finding(s)):`,
    ...findings,
    ...(more > 0 ? [`    … and ${more} more`] : []),
    '  The alias is wired above when the template shape allowed it — replace',
    '  cross-layer relative imports with it, then verify with: npx blueprint inspect',
  ].join('\n'));
}

export function renderLintScriptNote(kind: 'patched' | 'added', target?: string): OperationalText {
  return operationalText(kind === 'patched'
    ? 'package.json (lint script now also runs eslint — so lint runs the generated rules)'
    : `package.json (added "lint": "eslint ${target}" — so lint runs the generated rules)`);
}

export function renderLintScriptInstruction(lint: string | null, target: string): OperationalText {
  return operationalText(lint === null
    ? `Your package.json has no \`lint\` script — add one so lint runs the generated rules: "lint": "eslint ${target}".`
    : `Your \`lint\` script runs \`${lint}\` — the structural rules live in the generated eslint config, so lint would stay green while the architecture goes unchecked. Wire it up, e.g. "lint": "${lint} && eslint ${target}".`);
}

interface EslintWiringFacts {
  shape: string | null;
  legacyFile?: string;
  configFile?: string;
  hasTypescript: boolean;
  basePath?: string;
}

export function renderEslintWiringNote(facts: EslintWiringFacts): OperationalText {
  const blueprintImport = facts.basePath
    ? `./${facts.basePath}/blueprint.config.mjs`
    : './blueprint.config.mjs';

  const applicationRoot = facts.basePath
    ? '    import { fileURLToPath } from \'node:url\';\n'
    + `    const applicationRoot = fileURLToPath(new URL('./${facts.basePath}/', import.meta.url));\n`
    : '';

  if (facts.shape === 'legacy') {
    return operationalText(`${facts.legacyFile} is a legacy (non-flat) eslint config. Wiring the `
      + 'blueprint rules needs a flat-config / ESLint-9 migration first — that can break your '
      + 'lint pipeline, so it is a deliberate decision, not a side effect of adoption. Until you '
      + 'migrate, `blueprint inspect --baseline` already gates the architecture without touching '
      + 'eslint. Once on flat config, spread `...emitLint(blueprint)` from '
      + `eslint.config.blueprint.mjs.\n${eslintWiringTail(facts)}`);
  }

  if (facts.shape === 'tseslint') {
    return operationalText(
      'Your eslint config uses `tseslint.config()`. Wire blueprint in by wrapping the '
      + '(eslint.config.blueprint.mjs is your merge source):\n'
      + applicationRoot
      + `    import blueprint from '${blueprintImport}';\n`
      + '    import { emitLint } from \'@kekkai/blueprint\';\n'
      + '    import stylistic from \'@stylistic/eslint-plugin\';\n'
      + '    import imports from \'eslint-plugin-import-x\';\n'
      + '    export default tseslint.config(\n'
      + '      /* …your existing configs */\n'
      + `      ...emitLint(blueprint, ${lintOptions(true, facts.basePath)}),\n`
      + '    );\n'
      + '  emitLint goes LAST of the configs you already have — later entries win in flat\n'
      + '  config, so this keeps the blueprint\'s per-layer tuning alive over broad presets.\n'
      + '  Rules BOTH sides set (no-restricted-*) still need combining into ONE entry, and\n'
      + '  that combined entry is the one thing that goes after the spread.\n'
      + INJECT_NOTE
      + eslintWiringTail(facts),
    );
  }

  const spread = (facts.hasTypescript ? '    import tseslint from \'typescript-eslint\';\n' : '')
    + '    import stylistic from \'@stylistic/eslint-plugin\';\n'
    + '    import imports from \'eslint-plugin-import-x\';\n'
    + '    export default [ /* …your existing entries */ '
    + `...emitLint(blueprint, ${lintOptions(facts.hasTypescript, facts.basePath)}) ];\n`;

  return operationalText('eslint.config already exists — blueprint never edits it, so '
    + 'eslint.config.blueprint.mjs is your merge source, not a keepsake. Diff it, then spread '
    + 'the rules into your flat config:\n'
    + applicationRoot
    + `    import blueprint from '${blueprintImport}';\n`
    + '    import { emitLint } from \'@kekkai/blueprint\';\n'
    + spread
    + '  emitLint goes LAST of the configs you already have — later entries win in\n'
    + '  flat config, so this keeps the blueprint\'s per-layer tuning alive over broad\n'
    + '  presets. A `defineConfig([...])` wrapper takes the same spread, and its array\n'
    + '  IS the flat-config array. Rules BOTH sides set (no-restricted-*) still need\n'
    + '  combining into ONE entry, and that combined entry is the one thing that goes\n'
    + `  after the spread.${facts.hasTypescript
      ? ''
      : ' On a TypeScript\n  project add the TS plugin too — emitLint(blueprint, { typescript: tseslint.plugin, stylistic, imports }).'}\n`
      + INJECT_NOTE
      + eslintWiringTail(facts));
}

function lintOptions(ts: boolean, basePath?: string): string {
  const entries = [
    ...(ts ? ['typescript: tseslint.plugin'] : []),
    'stylistic',
    'imports',
    ...(basePath ? ['basePath: applicationRoot'] : []),
  ];

  return `{ ${entries.join(', ')} }`;
}

const INJECT_NOTE = '  Carry that options object over WHOLE. Three plugins are injected, never\n'
  + '  library deps: stylistic carries codeStyle / statementsPerLine /\n'
  + '  statementPadding, imports carries importBlock, and the TS one carries\n'
  + '  explicitAny. A gate whose plugin is absent emits NOTHING while lint still\n'
  + '  passes — dropping an argument looks exactly like a clean merge.\n';

function eslintWiringTail(facts: EslintWiringFacts): string {
  const ts7016 = facts.configFile?.endsWith('.ts')
    ? '  Your config file is TypeScript: importing ./blueprint.config.mjs trips TS7016\n'
    + '  when the tsconfig covering it lacks allowJs — add `allowJs: true` to that\n'
    + '  tsconfig (often tsconfig.node.json), or ship a one-line blueprint.config.d.mts\n'
    + '  declaring the default export as Blueprint. Name the choice in your report.\n'
    : '';

  return `${ts7016}  An entry is more than its selectors: whatever you combine needs the emitted\n`
    + `  block's \`ignores\` too. ${renderTestFilesOperational('merge-scope', 'en')}\n`
    + '  `npx blueprint rules --json` carries both — selectors and their\n'
    + '  `testExemptions`. Doctor compares selectors, not scope, so a missing exemption\n'
    + '  stays green here while the rebuilt entry has the wrong scope.\n'
    + '  Resolve rule conflicts explicitly, run your own lint, then DELETE the reference —\n'
    + '  adoption is not done while it remains.';
}
