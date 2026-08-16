/**
 * The architecture contract this repo holds itself to.
 *
 * It imports nothing, and that is not a style choice: inside this repo
 * `@kekkai/blueprint` resolves through `exports` to `./dist/index.js`, so a
 * `defineBlueprint` import here would read whatever was last built. The reader
 * (`src/project/resolve.ts`) is a bare dynamic `import` in plain Node, which
 * cannot load `src` either. So this is a plain object literal; the JSDoc type
 * below restores the annotation, and `eslint.config.ts` runs the same
 * `validateBlueprint` that `defineBlueprint` would have run.
 *
 * @type {import('./src').Blueprint}
 */
export default {
  name: '@kekkai/blueprint',
  framework: 'auto',
  architecture: {
    // Required by the schema, and used by nothing. No file in this repo imports
    // through an alias, so every alias-spelled ban compiled from it — the flow
    // bans, `fixtureImports` — matches nothing whichever name is written here.
    alias: '~lib',

    // One layer over the whole tree is how "we adopt the rules, not the
    // folder-structure governance" is expressed. `sourceRoot: '.'` resolves the
    // default layer glob to `src/**/*.{js,jsx,ts,tsx,vue}` — the whole tree, one
    // layer — and both structural rules then report 0. Neither zero measures this
    // code: this shape does not satisfy those rules, it disables them.
    //
    // `blueprint/relative-escape` is handed `layouts: { src: 'flat' }`, keyed by
    // the layer name, while the rule reads the segment under `src/` — `cli`,
    // `emit`, … — so its own guard turns every file away before it looks at an
    // import. Measured: a file that both escapes `src/` and leaves its folder
    // reports 0 under the options this config produces, and 2 when the key names
    // the folder the file is in. `no-restricted-imports` is alias-spelled, and
    // the alias note above is why it matches nothing here.
    //
    // So neither suppressions ledger has to exist — because nothing structural is
    // being asked, not because the tree answered.
    //
    // `layerFiles` cannot say this — `validateBlueprint` rejects a glob with no
    // `{layer}` placeholder, so `'src/**/*.{ts}'` is not available and this
    // shape is the one that works.
    sourceRoot: '.',

    // The gates reach test files. The two longest files in this repo were tests
    // (2128 and 1077 counted lines), and a rule about files not growing that
    // exempts the biggest ones is not the rule. It also switches `testFilename`
    // off, which is documented: that entry's `files` IS the test globs, and an
    // empty `files` is what ESLint rejects outright.
    testFiles: [],

    layers: [{ name: 'src', does: 'Everything this package ships.' }],
  },

  // No agent file is generated here. This repo authors `agent-contract.md` and
  // `CLAUDE.md` by hand and ships the first one; emitting either would overwrite
  // a published artifact with a description of this config.
  emit: { agents: [] },

  // The preset's recommended set, entire — not a subset chosen because it was
  // cheap. Two ids are absent and each is absent for a mechanical reason:
  //
  // `usePrefix` defaults to a layer named `hooks`, and `validateBlueprint`
  // throws on a layer that does not exist. Pointed at `src` instead it would
  // demand a `use` prefix on every exported function in the package.
  //
  // `deepWatch` guards its emit on `framework !== 'react'`, so under `auto` it
  // would emit `blueprint/no-deep-watch` over a tree with no Vue in it.
  rules: {
    maxLines: { tier: 'error', value: 400 },

    // The four the preset ships at `warn`, raised to `error`. The published
    // reason for `warn` is that no AST can decide whether a function does too
    // much — correct for the tool, wrong as a setting here, where a warning
    // stops nothing and nobody reads it. Raising them makes this repo's own
    // code the judgment the tool declines to make.
    maxLinesPerFunction: { tier: 'error', value: 100 },
    maxParams: { tier: 'error', value: 3 },
    maxStatements: { tier: 'error', value: 15 },
    complexity: { tier: 'error', value: 12 },

    unusedVars: 'error',
    explicitAny: 'error',

    // 100 is this repo's own cap and predates all of this. The emitted default
    // of 90 is not a small step from it: measured on the tree this work started
    // from, 90 reported 1244 rows where 100 reported 470.
    codeStyle: { tier: 'error', maxLen: 100 },

    statementsPerLine: 'error',
    statementPadding: 'error',
    importBlock: 'error',

    // Declared and inert on this shape, kept so the config states what the
    // project holds itself to: `fixtureImports` is alias-spelled and no file
    // uses the alias; `cycles` is an `inspect` finding rather than a lint rule;
    // `deadCode` is documentation by design; `usePrefixReactivity` reads the
    // FILE name against `use[A-Z]` and never an export, and no file here is
    // named that way (`src/plugin/use-prefix.ts` does export `usePrefix`);
    // `typedefOnlyFile` is scoped to `src/**/*.js` and there are none.
    //
    // `testFilename` is the row `testFiles: []` above switches off, and that is
    // load-bearing rather than incidental: measured, the rule would flag 23 files
    // here — 22 aspect suites named `<source>.<aspect>.test.ts` beside the source
    // they drive (`plan.eslint.test.ts`), and one whose subject is not a file
    // (`adoption.e2e.test.ts`). It wants a `<base>.ts` beside every
    // `<base>.test.ts`, and no aspect name can be one. The row stays so the trade
    // is declared rather than dropped without one; CLAUDE.md carries the naming
    // rule and the reason a suite splits.
    fixtureImports: 'error',
    cycles: 'error',
    deadCode: 'error',
    testFilename: 'error',
    usePrefixReactivity: 'warn',
    typedefOnlyFile: 'warn',
  },
};
