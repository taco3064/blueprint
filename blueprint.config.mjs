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
    // default layer glob to `src/**/*.{js,jsx,ts,tsx,vue}`, so a cross-folder
    // relative import is a SAME-layer import and reports nothing: measured on
    // this shape, `blueprint/relative-escape` 0 and `no-restricted-imports` 0.
    // That is why neither suppressions ledger has to exist.
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
    // from, 90 reported 1101 rows where 100 reported 470.
    codeStyle: { tier: 'error', maxLen: 100 },

    statementsPerLine: 'error',
    statementPadding: 'error',
    importBlock: 'error',

    // Declared and inert on this shape, kept so the config states what the
    // project holds itself to: `fixtureImports` is alias-spelled and no file
    // uses the alias; `cycles` is an `inspect` finding rather than a lint rule;
    // `deadCode` is documentation by design; `testFilename` is the row
    // `testFiles: []` above switches off, and it keeps its row rather than
    // being dropped without one; `usePrefixReactivity` has no `use`-prefixed
    // export to fire on; `typedefOnlyFile` is scoped to `src/**/*.js` and there
    // are none.
    fixtureImports: 'error',
    cycles: 'error',
    deadCode: 'error',
    testFilename: 'error',
    usePrefixReactivity: 'warn',
    typedefOnlyFile: 'warn',
  },
};
