import path from 'node:path';

import { aliasActions } from './alias';
import { assertContained } from './contain';
import { defaultAgentPaths, emitAgentFiles } from '../emit/agent';
import { emitHandbook, handbookPath } from '../emit/docs';
import { FRAMEWORK_EXTS } from '../emit/lint';
import { injectBetweenMarkers } from '../markdown';
import type { AgentTarget, Blueprint } from '../config';
import { GENERATED_ESLINT_BANNER, SUPPORTED_ESLINT_MAJORS } from '../project';
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
    actions.push({
      kind: 'write',
      path: 'blueprint.config.mjs',
      content: configSource,
      note: 'blueprint.config.mjs',
    });
  }

  // Where code already lives, an unbuilt layer's absence is its true state — a
  // .gitkeep shell is the manufactured net the playbook forbids.
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

      // Already integrated by its owner, symmetric with the wired eslint config.
      // The trade is stated: with no markers there is nothing init can refresh, so
      // a later config change silently strands the copy (field issue #26).
      if (
        existing !== null
        && !existing.includes(`<!-- ${MARKER}:START -->`)
        && existing.includes('@kekkai/blueprint')
      ) {
        actions.push({
          kind: 'instruct',
          note: `${file.path} already integrates the blueprint contract without markers — left as is, `
            + 'and init can never refresh it: after config changes, update it by hand — '
            + 'or wrap the '
            + `generated block in <!-- ${MARKER}:START --> / <!-- ${MARKER}:END --> once, and every `
            + 'later init rewrites just that block.',
        });

        continue;
      }

      // A hand-written context file is a document someone maintains — appending a
      // generated block is graffiti, so leave a reference beside it instead. The
      // reference ships WITH its markers, or the header's "init rewrites only
      // between them" is a claim the reader cannot see (field issue #26).
      if (existing !== null && !existing.includes(`<!-- ${MARKER}:START -->`)) {
        // `.blueprint` goes before whatever the extension is, not a literal `.md`:
        // `emit.agents` accepts any path, and a `.mdc` target produced a reference
        // path IDENTICAL to the file's own, so the write landed ON the document.
        // `extname` answers '' for a dotfile, giving `.gitignore.blueprint`.
        const ext = path.extname(file.path);

        const reference = ext
          ? `${file.path.slice(0, -ext.length)}.blueprint${ext}`
          : `${file.path}.blueprint`;

        actions.push(
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

  // A contract the current `emit.agents` no longer names is stale. Wholly generated
  // files are init's to remove; one carrying hand-written content only gets told.
  // The note names the ACTUAL cause of the narrowing — a deletion blamed on a config
  // field that is not there reads as breakage.
  const emitted = new Set(agentFiles.map((file) => file.path));

  const cause
    = emit?.agents !== undefined
      ? 'no longer in emit.agents'
      : options.agentTarget !== undefined
        ? 'narrowed by --agent; declare emit.agents in blueprint.config.mjs to make this permanent'
        : 'not among the emitted targets';

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
    // The user's own config carries one of detect's wiredness tells — wired by
    // its owner. Nothing to hand off, and no reference to nag about. The note
    // names no specifier: the tell may have been the `emitLint(` call, and a
    // config reaching it through a shared config package never spells this
    // package's name at all.
    actions.push({
      kind: 'instruct',
      note: 'eslint config already wires blueprint\'s rules — nothing to merge.',
    });
  } else if (state.hasEslintConfig || state.legacyEslintConfig !== undefined) {
    // A reference file to diff and merge from, never wired in. A legacy `.eslintrc*`
    // gets one too — a fresh flat config beside it would be two configs, two ledgers.
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

  // The anti-bypass guard defaults to ADOPT, so its plugin ships on every path or
  // the bold default hits "Cannot find package" (field issue #9).
  const deps = state.missingDeps;

  // Every local write lands before the one child process — SECURITY.md's rule for
  // the other spawn, applied to the install. An aborted install then leaves a tree
  // complete except for `node_modules`, rather than one missing its alias wiring
  // (field run #131).
  actions.push(...aliasActions(state, architecture, configSource !== null));

  if (deps.length) {
    if (options.install !== false) {
      actions.push({
        kind: 'install',
        command: installCommand(state.packageManager, deps),
        // Renders as "✓ install: <note>", so a note opening with "install" stutters
        // (field issue #34). Unpinned on purpose, and the range says so.
        //
        // Two facts, in this order. The peer-range half leads: it is checkable from
        // where the adopter stands, and `detect.test.ts` proves it per carrier. The
        // CI half names its channel rather than a bare "both tested" — the published
        // tarball's `devDependencies` carry eslint 9, and that claim beside a visible
        // `^9.39.2` is two true things with nothing bridging them (field run #150).
        note: deps.includes('eslint')
          ? `${deps.join(', ')} — eslint unpinned, resolving to the newest supported major (${SUPPORTED_ESLINT_MAJORS.join(' and ')} are both admitted by every carrier's peer range, and @kekkai/blueprint's CI runs its own suite on each)`
          : deps.join(', '),
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
      note: 'Dead code (optional): `blueprint inspect` reports dead files; '
        + 'for dead *exports*, install knip and configure its entry points — '
        + 'that is the source of truth, not the warn-tier `import/no-unused-modules`.',
    },
    {
      kind: 'instruct',
      note: 'CSS token governance (optional): install stylelint + '
        + '@csstools/stylelint-value-no-unknown-custom-properties, '
        + 'pointing importFrom at your token source file.',
    },
  );

  // Last, over the finished list, so no path source can be added above and miss
  // it — and in the planner rather than only at the effect, so `--dry-run` never
  // prints a plan the real run would refuse. A divergence between the printed
  // plan and what apply does is itself in `SECURITY.md`'s scope.
  assertContained(actions);

  return actions;
}

/** Merge the contract into a shared context file: refresh in place, append, or create. */
/**
 * The wiring instruction for an existing eslint config, tailored to its shape: a
 * `tseslint.config()` call wraps the spread, a flat array takes it directly, and a
 * legacy `.eslintrc*` needs a flat-config migration decided first.
 */
function eslintWiringNote(state: ProjectState): string {
  // Both plugins are injected, never depended on. Getting the options object
  // wrong is silent: the gates riding a missing plugin emit nothing, and a
  // vacuous gate looks exactly like a passing one — so every snippet below
  // carries the full object rather than the minimal one.
  const lintOptions = (ts: boolean) =>
    (ts ? '{ typescript: tseslint.plugin, stylistic, imports }' : '{ stylistic, imports }');

  // A `tseslint.config()` shape IS a TypeScript project whatever the dep scan
  // says, so that branch keeps the TS variant unconditionally.
  const options = lintOptions(state.hasTypescript);

  const injectNote = '  Carry that options object over WHOLE. Three plugins are injected, never\n'
    + '  library deps: stylistic carries codeStyle / statementsPerLine /\n'
    + '  statementPadding, imports carries importBlock, and the TS one carries\n'
    + '  explicitAny. A gate whose plugin is absent emits NOTHING while lint still\n'
    + '  passes — dropping an argument looks exactly like a clean merge.\n';

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

  // This path never gets the playbook. "Combine into ONE entry" is the half that
  // fails loudly; the `ignores` is the half that fails silently, since doctor
  // compares selectors rather than scope.
  const shared
    = `${ts7016}  An entry is more than its selectors: whatever you combine needs the emitted\n`
      + '  block\'s `ignores` too (every structural entry exempts test files, and a rebuilt\n'
      + '  entry has none unless you write one). `npx blueprint rules --json` carries both —\n'
      + '  selectors and their `testExemptions`. Doctor compares selectors, not scope, so a\n'
      + '  missing exemption stays green here and governs test files it was never meant to.\n'
      + '  Resolve rule conflicts explicitly, run your own lint, then DELETE the reference —\n'
      + '  adoption is not done while it remains.';

  if (state.eslintConfigShape === 'legacy') {
    return `${state.legacyEslintConfig} is a legacy (non-flat) eslint config. Wiring the `
      + 'blueprint rules needs a flat-config / ESLint-9 migration first — that can break your '
      + 'lint pipeline, so it is a deliberate decision, not a side effect of adoption. Until you '
      + 'migrate, `blueprint inspect --baseline` already gates the architecture without touching '
      + 'eslint. Once on flat config, spread `...emitLint(blueprint)` from '
      + 'eslint.config.blueprint.mjs.\n'
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
      + injectNote
      + shared;
  }

  // The snippet is what gets copied — on a TS repo it must BE the TS
  // version, not a JS version corrected by prose four lines later (field
  // issue #12: a copy-the-first-snippet agent ships non-TS-aware rules).
  const spread = (state.hasTypescript ? '    import tseslint from \'typescript-eslint\';\n' : '')
    + '    import stylistic from \'@stylistic/eslint-plugin\';\n'
    + '    import imports from \'eslint-plugin-import-x\';\n'
    + `    export default [ /* …your existing entries */ ...emitLint(blueprint, ${options}) ];\n`;

  return 'eslint.config already exists — blueprint never edits it, so eslint.config.blueprint.mjs '
    + 'is your merge source, not a keepsake. Diff it, then spread the rules into your flat '
    + 'config:\n'
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
      + injectNote
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
 * The generated flat config: parser wiring, the blueprint-driven rules, and the
 * handbook's third-party CORE block. Parsers only — framework rule packs stay the
 * user's choice, and none of these packages is a dependency of this library.
 */
function eslintConfigSource(blueprint: Blueprint, state: ProjectState): string {
  const framework = blueprint.framework !== 'auto' ? blueprint.framework : state.framework;
  const vue = framework === 'vue';
  const ts = state.hasTypescript;

  // The guard scopes to the detected stack's extensions, like the parser
  // blocks — a react repo's guard used to carry `.vue`, and four field
  // agents hand-trimmed it (issue #30). Unknown stack keeps the full set.
  const guardExts = framework ? FRAMEWORK_EXTS[framework] : FRAMEWORK_EXTS.auto;
  const sourceRoot = blueprint.architecture.sourceRoot ?? 'src';
  const guardRoot = sourceRoot === '.' ? '' : `${sourceRoot}/`;

  const parserImports = [
    ...(vue ? ['import vueParser from \'vue-eslint-parser\';'] : []),
    ...(ts ? ['import tseslint from \'typescript-eslint\';'] : []),
  ];

  const parserHeader = [
    '  // Parser setup — needed when THIS file is the live config. Merging',
    '  // into an existing config that already wires parsers? Skip these',
    '  // blocks — copying them re-parses files your config already handles.',
    '  // A skipped block leaves its parser package installed: leave it — a',
    '  // later init treats it as required for the stack and re-installs it.',
    // "Does my config already wire parsers?" recurred in the field with a
    // preset that wires one internally — answer it here, where the merge
    // decision is being made (only meaningful on a TS stack).
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

  const parserBlocks = [
    // Parsers only, so every file the rules cover can actually be parsed.
    ...(vue
      ? [
          '  {',
          '    files: [\'**/*.vue\'],',
          ts
            ? '    languageOptions: { parser: '
            + 'vueParser, parserOptions: { parser: tseslint.parser } },'
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

  // `cycles` emits no ESLint line — inspect detects them, and `import/no-cycle`
  // re-walks the graph per file (92s on 850 files). `deadCode` likewise:
  // import/no-unused-modules cannot run under flat config, so that is knip's job.
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
    'import stylistic from \'@stylistic/eslint-plugin\';',
    'import imports from \'eslint-plugin-import-x\';',
    ...parserImports,
    'import blueprint from \'./blueprint.config.mjs\';',
    '',
    'export default [',
    ...(parserBlocks.length ? parserHeader : []),
    ...parserBlocks,
    // All three plugins are INJECTED, never library deps. Drop an argument and its
    // gates go silent without a word — keep the object whole when merging.
    ts
      ? '  ...emitLint(blueprint, { typescript: tseslint.plugin, stylistic, imports }),'
      : '  ...emitLint(blueprint, { stylistic, imports }),',
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
    ...core,
    '    },',
    '  },',
    '];',
    '',
  ].join('\n');
}

/**
 * How this repo runs a package script. Its sibling below builds the install command
 * from the same detected fact, and the emitted contract used to hardcode `npm run
 * lint` beside it — init detecting `pnpm`, installing with `pnpm add`, and then
 * telling the next agent to run npm (field run #141). The two emitters that carry
 * that sentence cannot see the repo by design, so they name no runner at all; this
 * is for the playbook, which is written by a runtime that can.
 */
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
