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
    actions.push({ kind: 'write', path: 'blueprint.config.mjs', content: configSource, note: 'blueprint.config.mjs' });
  }

  const handbook = handbookPath(blueprint);

  actions.push(...scaffoldActions(blueprint, state, handbook, configSource !== null, options));

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
            + 'and init can never refresh it: after config changes, update it by hand — or wrap the '
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
              + 'lets a later init refresh the block after config changes (integrating without them '
              + 'means updating it by hand, forever) — then delete the reference. (An agent running '
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
      note: 'Dead code (optional): `blueprint inspect` reports dead files; for dead *exports*, install knip and configure its entry points — that is the source of truth, not the warn-tier `import/no-unused-modules`.',
    },
    {
      kind: 'instruct',
      note: 'CSS token governance (optional): install stylelint + @csstools/stylelint-value-no-unknown-custom-properties, pointing importFrom at your token source file.',
    },
  );

  // Last, over the finished list, so no path source can be added above and miss
  // it — and in the planner rather than only at the effect, so `--dry-run` never
  // prints a plan the real run would refuse. A divergence between the printed
  // plan and what apply does is itself in `SECURITY.md`'s scope.
  assertContained(actions);

  return actions;
}

/**
 * A module's entry, and the framework entry point beside it. Fixed strings that
 * name no module: these files land inside the governed net, where `codeStyle`
 * caps a line at 90 characters — comments included, and with no fixer — so a
 * line interpolating a module name drifts with the name and turns an adopter's
 * first lint red.
 */
const MODULE_ENTRY = [
  '// The module\'s public surface — everything else in this folder is private to it.',
  'export {};',
  '',
].join('\n');

const MODULE_MAIN = [
  '// The framework entry your bundler loads. It lives inside this module because',
  '// mounting the app is app-wide composition, not a module of its own.',
  'export {};',
  '',
].join('\n');

/**
 * What `init` materialises at the source root, and the sentences that explain it.
 *
 * The guard is unchanged: where code already lives, an unbuilt position's absence
 * is its true state — a `.gitkeep` shell is the manufactured net the playbook
 * forbids. What changes with the config is the LIST it iterates. Under `modules` a
 * layer is a folder inside a module and has none of its own, so the declared
 * positions at the source root are the modules; a flat config's are its layers.
 */
function scaffoldActions(
  blueprint: Blueprint,
  state: ProjectState,
  handbook: string,
  generatedConfig: boolean,
  options: PlanOptions,
): Action[] {
  const { architecture } = blueprint;
  const modules = architecture.modules;

  // `sourceRoot` rather than a literal `src`: a modular config at the project
  // root is legal (`defineBlueprint` accepts it), and a position written under
  // `src/` there is a folder that config does not have.
  const root = architecture.sourceRoot ?? 'src';
  const prefix = root === '.' ? '' : `${root}/`;

  if (options.hasSourceFiles) {
    // Only where init generated the config in this run: there the adopter answered
    // --structure on this run and got no folder for the answer, which reads as a
    // failed run. An existing modular config means nobody was expecting one, and
    // the note would be noise on every later init.
    return modules && generatedConfig
      ? [{ kind: 'instruct', note: nothingScaffoldedNote(handbook, root) }]
      : [];
  }

  if (!modules) {
    return architecture.layers
      .filter((layer) => !state.existingSrcDirs.includes(layer.name))
      .map((layer) => ({ kind: 'mkdir', path: `src/${layer.name}`, note: `src/${layer.name}/` }));
  }

  const actions: Action[] = [];
  const ext = state.hasTypescript ? 'ts' : 'js';

  for (const [index, module] of modules.entries()) {
    const entry = `${prefix}${module.name}/index.${ext}`;

    actions.push({
      kind: 'write',
      path: entry,
      content: MODULE_ENTRY,
      note: `${entry} (module entry — everything else under ${prefix}${module.name}/ is private to it)`,
    });

    // `main` is not a declared position. `index` is fixed by the model, while
    // `main` is a framework fact the preset knows — so it cannot be keyed on a
    // module's NAME, and a hand-written `[Fighter, Combat, common]` must not
    // receive `Fighter/main.tsx`. Only where init generated the config is the
    // first module a name blueprint chose, and only then is writing an entry
    // point into it a fact rather than a claim about the adopter's architecture.
    if (index === 0 && generatedConfig) {
      const main = `${prefix}${module.name}/main.${mainExt(blueprint, state.hasTypescript)}`;

      actions.push({
        kind: 'write',
        path: main,
        content: MODULE_MAIN,
        note: `${main} (the framework entry — mounting the app is app-wide composition, so it lives in the module rather than at the source root; point your bundler at it)`,
      });
    }
  }

  actions.push({ kind: 'instruct', note: modulesScaffoldedNote(handbook, root) });

  return actions;
}

/** JSX only where the framework's entry holds JSX — a Vue entry is plain TS/JS. */
function mainExt(blueprint: Blueprint, typescript: boolean): string {
  if (blueprint.framework === 'react') return typescript ? 'tsx' : 'jsx';

  return typescript ? 'ts' : 'js';
}

/** Where the module tree is drawn, in the words both scaffold arms end on. */
function shapeSentence(handbook: string, root: string): string {
  return `The shape is in the handbook this run writes, ${handbook} (see "## Modules"): `
    + `${root}/<module>/<layer>/, with the module's \`index\` as its only public surface`;
}

/**
 * A tree holding two folders reads as a failed run, so the run says otherwise
 * before the adopter concludes it. Three jobs (#193), each carrying its cause and
 * its next step: this is finished rather than half-built, what was NOT created and
 * why blueprint could not name it, and where the shape it takes is drawn.
 */
function modulesScaffoldedNote(handbook: string, root: string): string {
  return 'The module folders your config declares are the whole scaffold, and that is this '
    + 'step finished rather than half-done — under `modules` a layer is a folder INSIDE a '
    + 'module, so there is nothing else to build at the source root until you name a domain. '
    + 'Run `npx blueprint inspect` to see it: exit 0, no error, no warning, and one '
    + 'missing-layer note per declared layer, which is runway (the rules arm when code lands) '
    + 'rather than a todo. No feature module was created because blueprint cannot name a '
    + 'domain it has never seen — only what the config declares was built, so add one folder '
    + `per domain under ${root}/ as they appear and declare each in \`architecture.modules\`; `
    + 'declaration order is the flow, so a module may import only modules declared after it. '
    + `${shapeSentence(handbook, root)} — read it before you create the first module folder.`;
}

/**
 * The same three jobs where the tree already holds code. The first two change
 * shape (nothing was scaffolded, and the reason is the predicate's own) and the
 * third becomes the whole answer — the filesystem demonstrates nothing here.
 *
 * It points at `inspect` and never predicts it. Root files are read as wiring and
 * the tree is clean, but ONE top-level folder makes it `structure-mismatch` plus
 * `undeclared-module` at error tier — which `templateCleanup` prints a few lines
 * below this note, in the same run. A claim of "clean" would be this run
 * contradicting its own output.
 */
function nothingScaffoldedNote(handbook: string, root: string): string {
  return `No module folder was created: ${root}/ already holds code, and an empty module `
    + 'folder beside it is a net that catches nothing — the manufactured shell blueprint '
    + 'tells you never to build. Nothing here is half-done; `npx blueprint inspect` is what '
    + 'reads the tree you actually have. Blueprint cannot name a domain it has never seen, '
    + 'and it will not move your files for you: create the folder when you name the first '
    + 'domain, declare it in `architecture.modules`, and move what belongs to it in — '
    + 'declaration order is the flow, so a module may import only modules declared after it. '
    + `${shapeSentence(handbook, root)}. On this tree that document is the whole example — `
    + 'nothing on disk demonstrates it.';
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
    (ts
      ? '{ typescript: tseslint.plugin, stylistic, imports, projectRoot }'
      : '{ stylistic, imports, projectRoot }');

  // `projectRoot` is a value the merged file has to COMPUTE, not a package it
  // imports, so it travels as these two lines rather than inside the options
  // object — a merge that copies the spread and not this leaves `projectRoot`
  // undefined, which is why doctor checks for it.
  const rootLines = '    import { dirname } from \'node:path\';\n'
    + '    import { fileURLToPath } from \'node:url\';\n'
    + '    const projectRoot = dirname(fileURLToPath(import.meta.url));\n';

  // A `tseslint.config()` shape IS a TypeScript project whatever the dep scan
  // says, so that branch keeps the TS variant unconditionally.
  const options = lintOptions(state.hasTypescript);

  const injectNote = '  Carry that options object over WHOLE. Three plugins are injected, never\n'
    + '  library deps: stylistic carries codeStyle / statementsPerLine /\n'
    + '  statementPadding, imports carries importBlock, and the TS one carries\n'
    + '  explicitAny. A gate whose plugin is absent emits NOTHING while lint still\n'
    + '  passes — dropping an argument looks exactly like a clean merge.\n'
    + '  projectRoot is the fourth member and the only one that is not a plugin:\n'
    + '  it is the absolute path this config file sits at, and it is what stops a\n'
    + '  checkout inside a directory named like one of your layers from being read\n'
    + '  as living in that layer. Dropping it silences relative-import errors that\n'
    + '  `blueprint inspect` still reports — doctor reddens on a missing one, so\n'
    + '  unlike the three above this member is guarded rather than trusted.\n';

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
      + '    import stylistic from \'@stylistic/eslint-plugin\';\n'
      + '    import imports from \'eslint-plugin-import-x\';\n'
      + rootLines
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
    + rootLines
    + `    export default [ /* …your existing entries */ ...emitLint(blueprint, ${options}) ];\n`;

  return 'eslint.config already exists — blueprint never edits it, so eslint.config.blueprint.mjs '
    + 'is your merge source, not a keepsake. Diff it, then spread the rules into your flat config:\n'
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
      : ' On a TypeScript\n  project add the TS plugin too — emitLint(blueprint, { typescript: tseslint.plugin, stylistic, imports, projectRoot }).'}\n`
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
    'import { dirname } from \'node:path\';',
    'import { fileURLToPath } from \'node:url\';',
    'import { emitLint } from \'@kekkai/blueprint\';',
    'import comments from \'@eslint-community/eslint-plugin-eslint-comments\';',
    'import stylistic from \'@stylistic/eslint-plugin\';',
    'import imports from \'eslint-plugin-import-x\';',
    ...parserImports,
    'import blueprint from \'./blueprint.config.mjs\';',
    '',
    '// Where this file sits IS the project root, and that is the point: the',
    '// relative-import rule is handed absolute paths and otherwise has only the',
    '// layer name to anchor on, so a checkout inside a directory named like one',
    '// of your layers gets read as living in that layer. cwd cannot stand in —',
    '// it follows wherever eslint was invoked from; this does not move.',
    '// Spelled the long way on purpose: import.meta.dirname needs Node 20.11,',
    '// and this package supports 18.',
    'const projectRoot = dirname(fileURLToPath(import.meta.url));',
    '',
    'export default [',
    ...(parserBlocks.length ? parserHeader : []),
    ...parserBlocks,
    // All three plugins are INJECTED, never library deps. Drop an argument and its
    // gates go silent without a word — keep the object whole when merging.
    ts
      ? '  ...emitLint(blueprint, { typescript: tseslint.plugin, stylistic, imports, projectRoot }),'
      : '  ...emitLint(blueprint, { stylistic, imports, projectRoot }),',
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

  if (pm === 'npm') return `npm install -D ${list}`;

  return `${pm} add -D ${list}`;
}
