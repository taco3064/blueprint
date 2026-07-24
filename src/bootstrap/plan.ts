import { aliasActions } from './alias';
import { defaultAgentPaths, emitAgentFiles } from '../emit/agent';
import { emitHandbook, handbookPath } from '../emit/docs';
import { injectBetweenMarkers } from '../markdown';
import type { AgentTarget, Blueprint } from '../config';
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
  /** The source tree already holds code — skip empty-layer scaffolding. */
  hasSourceFiles?: boolean;
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

  // Empty layer folders are guidance only on a truly empty tree. Where code
  // already lives, an unbuilt layer's absence is its true state — a .gitkeep
  // shell would be the physical twin of the manufactured net the playbook
  // forbids ("never invent a layer").
  if (!options.hasSourceFiles) {
    for (const layer of architecture.layers) {
      if (!state.existingSrcDirs.includes(layer.name)) {
        actions.push({ kind: 'mkdir', path: `src/${layer.name}`, note: `src/${layer.name}/` });
      }
    }
  }

  const handbook = handbookPath(blueprint);

  actions.push({ kind: 'write', path: handbook, content: emitHandbook(blueprint), note: handbook });

  const targets = options.agentTarget ? [options.agentTarget] : undefined;
  const agentFiles = emitAgentFiles(blueprint, targets);

  for (const file of agentFiles) {
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

  // A contract a previous init emitted that the current emit.agents no
  // longer names is a stale artifact — the field workflow was config-edit →
  // re-init → manual rm. Wholly generated files (nothing outside the marker
  // block; own-strategy rules files by construction) are init's to remove;
  // one carrying hand-written content only gets told. The note names the
  // ACTUAL cause of the narrowing — a deletion whose stated reason points
  // at a config field that is not there reads as breakage, and a --agent
  // narrowing silently un-narrows on the next plain init unless the agent
  // is told how to make it permanent.
  const emitted = new Set(agentFiles.map((file) => file.path));

  const cause
    = emit?.agents !== undefined
      ? 'no longer in emit.agents'
      : options.agentTarget !== undefined
        ? 'narrowed by --agent; declare emit.agents in blueprint.config.mjs to make this permanent'
        : 'not among the emitted targets';

  for (const spec of defaultAgentPaths()) {
    const existing = options.existingAgentFiles?.[spec.path] ?? null;

    if (emitted.has(spec.path) || existing === null) continue;

    if (spec.strategy === 'own' || isWhollyGenerated(existing)) {
      actions.push({
        kind: 'rm',
        path: spec.path,
        note: `${spec.path} (stale agent contract — ${cause})`,
      });
    } else if (existing.includes(`<!-- ${MARKER}:START -->`)) {
      actions.push({
        kind: 'instruct',
        note: `${spec.path} is no longer among the emitted agent contracts (${cause}) but carries hand-written content around its BLUEPRINT block — remove the block (or the file) yourself if it is unwanted.`,
      });
    }
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
  } else if (state.hasEslintConfig || state.legacyEslintConfig !== undefined) {
    // Copy-ready hand-off: the full generated config lands next to the user's
    // own as a reference file they can diff and merge from — never wired in.
    // A legacy `.eslintrc*` gets the reference too (NOT a fresh flat config
    // written next to it — that would be two configs, two ledgers).
    actions.push({
      kind: 'write',
      path: 'eslint.config.blueprint.mjs',
      content: eslintConfigSource(blueprint, state),
      note: 'eslint.config.blueprint.mjs (reference — not wired in)',
    });

    actions.push({ kind: 'instruct', note: eslintWiringNote(state) });
  } else {
    actions.push({
      kind: 'write',
      path: 'eslint.config.mjs',
      content: eslintConfigSource(blueprint, state),
      note: 'eslint.config.mjs',
    });
  }

  // The anti-bypass guard defaults to ADOPT, so its plugin is provisioned
  // on every path — an agent following the bold default must not hit
  // "Cannot find package" (field issue #9). Dropping the block is the
  // exception, and the guard comment says to remove the dep with it.
  const deps = state.missingDeps;

  if (deps.length) {
    if (options.install !== false) {
      actions.push({
        kind: 'install',
        command: installCommand(state.packageManager, deps),
        note: `install ${deps.join(', ')}`,
      });
    } else {
      // --no-install must not silently drop the requirement — surface the
      // exact command, or the install claim rings empty.
      actions.push({
        kind: 'instruct',
        note: `Install skipped — run it yourself:\n    ${installCommand(state.packageManager, deps)}`,
      });
    }
  }

  actions.push(
    {
      kind: 'instruct',
      // knip is not installed by default: zero-config knip false-flags entry
      // points, so shipping it commented-out (or pre-installed but unused)
      // is a dangling promise. Recommend it as the opt-in dead-code gate.
      note: 'Dead code (optional): `blueprint inspect` reports dead files; for dead *exports*, install knip and configure its entry points — that is the source of truth, not the warn-tier `import/no-unused-modules`.',
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
/**
 * The wiring instruction for an existing eslint config, tailored to its
 * shape so the user (or an agent) doesn't have to reverse-engineer the merge:
 * a `tseslint.config()` call wraps the spread, a flat array takes it directly,
 * and a legacy `.eslintrc*` needs a flat-config migration decided first.
 */
function eslintWiringNote(state: ProjectState): string {
  // A TypeScript eslint config importing the .mjs blueprint config trips
  // TS7016 (no declaration file) when the tsconfig covering the config
  // lacks allowJs — the repo's own tsc gate goes red after an otherwise
  // clean merge, and the fix looks like the agent's own invention unless
  // it is named here (field issue #22).
  const ts7016 = state.eslintConfigFile?.endsWith('.ts')
    ? '  Your config file is TypeScript: importing ./blueprint.config.mjs trips TS7016\n'
    + '  when the tsconfig covering it lacks allowJs — add `allowJs: true` to that\n'
    + '  tsconfig (often tsconfig.node.json), or ship a one-line blueprint.config.d.mts\n'
    + '  declaring the default export as Blueprint. Name the choice in your report.\n'
    : '';

  const shared
    = `${ts7016}  Resolve rule conflicts explicitly, run your own lint, then DELETE the reference —\n`
      + '  adoption is not done while it remains.';

  if (state.eslintConfigShape === 'legacy') {
    return `${state.legacyEslintConfig} is a legacy (non-flat) eslint config. Wiring the `
      + 'blueprint rules needs a flat-config / ESLint-9 migration first — that can break your '
      + 'lint pipeline, so it is a deliberate decision, not a side effect of adoption. Until you '
      + 'migrate, `blueprint inspect --baseline` already gates the architecture without touching '
      + 'eslint. Once on flat config, spread `...emitLint(blueprint)` from eslint.config.blueprint.mjs.\n'
      + shared;
  }

  // emitLint spreads LAST: flat config's later-entries-win means an earlier
  // spread lets a preset (e.g. tseslint.recommended) silently override the
  // tuned per-layer rules — the exact trap the playbook warns about, which
  // this hint used to walk people into (field issue #6).
  if (state.eslintConfigShape === 'tseslint') {
    return 'Your eslint config uses `tseslint.config()`. Wire blueprint in by wrapping the spread '
      + '(eslint.config.blueprint.mjs is your merge source):\n'
      + '    import blueprint from \'./blueprint.config.mjs\';\n'
      + '    import { emitLint } from \'@kekkai/blueprint\';\n'
      + '    export default tseslint.config(\n'
      + '      /* …your existing configs */\n'
      + '      ...emitLint(blueprint, { typescript: tseslint.plugin }),\n'
      + '    );\n'
      + '  emitLint goes LAST — later entries win in flat config, so this keeps the\n'
      + '  blueprint\'s per-layer tuning alive over broad presets. Rules BOTH sides set\n'
      + '  (no-restricted-*) still need combining into ONE entry.\n'
      + shared;
  }

  // The snippet is what gets copied — on a TS repo it must BE the TS
  // version, not a JS version corrected by prose four lines later (field
  // issue #12: a copy-the-first-snippet agent ships non-TS-aware rules).
  const spread = state.hasTypescript
    ? '    import tseslint from \'typescript-eslint\';\n'
    + '    export default [ /* …your existing entries */ ...emitLint(blueprint, { typescript: tseslint.plugin }) ];\n'
    : '    export default [ /* …your existing entries */ ...emitLint(blueprint) ];\n';

  return 'eslint.config already exists — blueprint never edits it, so eslint.config.blueprint.mjs '
    + 'is your merge source, not a keepsake. Diff it, then spread the rules into your flat config:\n'
    + '    import blueprint from \'./blueprint.config.mjs\';\n'
    + '    import { emitLint } from \'@kekkai/blueprint\';\n'
    + spread
    + '  emitLint goes LAST — later entries win in flat config, so this keeps the\n'
    + '  blueprint\'s per-layer tuning alive over broad presets. A `defineConfig([...])`\n'
    + '  wrapper takes the same spread — its array IS the flat-config array. Rules BOTH\n'
    + `  sides set (no-restricted-*) still need combining into ONE entry.${state.hasTypescript
      ? ''
      : ' On a TypeScript\n  project pass the TS plugin — emitLint(blueprint, { typescript: tseslint.plugin }).'}\n`
      + shared;
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

  const parserImports = [
    ...(vue ? ['import vueParser from \'vue-eslint-parser\';'] : []),
    ...(ts ? ['import tseslint from \'typescript-eslint\';'] : []),
  ];

  const parserHeader = [
    '  // Parser setup — needed when THIS file is the live config. Merging',
    '  // into an existing config that already wires parsers? Skip these',
    '  // blocks — copying them re-parses files your config already handles.',
    // "Does my config already wire parsers?" recurred in the field with a
    // preset that wires one internally — answer it here, where the merge
    // decision is being made (only meaningful on a TS stack).
    ...(ts
      ? [
          '  // "Already wires" includes presets that do it internally: extending',
          '  // tseslint.configs.recommended (or any typescript-eslint preset)',
          '  // means the TS parser is wired even if no languageOptions.parser',
          '  // line is visible. Your own lint passing on .ts/.tsx confirms it.',
        ]
      : []),
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
          // The TS-parser skip criterion above reads as the only rule
          // without this — the js/jsx call was a judgment nobody backed
          // (field issue #21).
          '  // This jsx block matters only while .js/.jsx source exists — on a',
          '  // TS-only repo it is dormant, and skipping it in a merge loses nothing.',
          '  {',
          '    files: [\'**/*.{js,jsx}\'],',
          '    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },',
          '  },',
        ]
      : []),
  ];

  // rules.cycles deliberately emits no ESLint line: `inspect` detects module
  // cycles already, and `import/no-cycle` re-checks the whole graph per file —
  // measured at 92s on an 850-file repo. One detector, the cheap one.
  // rules.deadCode likewise: import/no-unused-modules cannot run under flat
  // config (import-js/eslint-plugin-import#3079) — dead code is knip's job.
  const core = [
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
    'import comments from \'@eslint-community/eslint-plugin-eslint-comments\';',
    ...parserImports,
    'import blueprint from \'./blueprint.config.mjs\';',
    '',
    'export default [',
    ...(parserBlocks.length ? parserHeader : []),
    ...parserBlocks,
    // TS projects hand emitLint the @typescript-eslint plugin so the
    // unusedVars gate runs its TS-aware rule (core false-flags enum members).
    ts
      ? '  ...emitLint(blueprint, { typescript: tseslint.plugin }),'
      : '  ...emitLint(blueprint),',
    '  // The anti-bypass guard — NOT part of emitLint. A silent, unexplained',
    '  // eslint-disable is exactly how an agent routes around every rule',
    '  // above, so these two rules force each disable to carry a scope and a',
    '  // -- reason. Default: ADOPT. On a brownfield config, annotate the',
    '  // existing bare disables (or ledger them via --suppress-all) rather',
    '  // than dropping the block; dropping is the exception — only when the',
    '  // team already owns a disable discipline, and say so in the report.',
    '  // Its plugin (@eslint-community/eslint-plugin-eslint-comments) is',
    '  // installed by init on every path; dropping the block? Remove that',
    '  // dependency with it.',
    '  // Scope: JS/TS disable comments only — Vue template <!-- eslint-disable -->',
    '  // directives are not gated by these rules.',
    '  {',
    '    files: [\'src/**/*.{js,jsx,ts,tsx,vue}\'],',
    '    plugins: {',
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

export function installCommand(pm: PackageManager, deps: string[]): string {
  const list = deps.join(' ');

  if (pm === 'npm') return `npm install -D ${list}`;

  return `${pm} add -D ${list}`;
}
