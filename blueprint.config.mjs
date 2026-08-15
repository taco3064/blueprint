// This package's own blueprint. Self-referencing `@kekkai/blueprint` resolves
// through the `exports` field to `./dist/index.js`, so `npm run build` has to
// have run — the same import an adopter writes, resolved the same way.
//
// It governs nothing yet. Nothing in `npm run lint` or CI reads this file; the
// composed run that does is `npm run lint:blueprint`, and it is red by
// construction. See #293 and #319.
import { defineBlueprint } from '@kekkai/blueprint';

export default defineBlueprint({
  name: '@kekkai/blueprint',
  // Not a front-end app. `auto` is what the schema has for that, and it widens
  // the layer globs to every source extension rather than naming a framework
  // this repo does not use.
  framework: 'auto',
  architecture: {
    // Declared because the schema requires it, and inert here: no import in
    // this tree spells an alias, so every alias-based ban matches nothing.
    // That is the debt #293 baselines, not a rule that passes.
    alias: '~app',
    sourceRoot: 'src',
    // HIGH TO LOW — a layer may import only layers declared AFTER it. This is
    // the reverse of the arrow in CLAUDE.md's "Layering (one-way, low → high)",
    // which reads bottom-up; both spellings describe one graph and that section
    // says so too.
    //
    // `survey` before `impact` is arbitrary: neither imports the other, so
    // either order is legal and the one chosen follows CLAUDE.md's prose.
    //
    // No layer declares `allowedImporters`, so every layer may reach everything
    // below it — including edges nobody writes. Narrowing is a later decision,
    // which makes every count measured against this config a LOWER bound.
    layers: [
      { name: 'cli', does: 'Argument parsing and dispatch — the only entry a user runs.' },
      { name: 'bootstrap', does: 'The init runtime, split plan (pure) / apply (I/O).' },
      { name: 'survey', does: 'A read-only report of the repo as it is, embedded in the authoring playbook.' },
      { name: 'impact', does: 'What the emitted rules would do to a repo, measured against a real ESLint.' },
      { name: 'inspect', does: 'The verify runtime: scan, analyze, findings, doctor.' },
      { name: 'project', does: 'The shared reader — detect the project, resolve its blueprint.' },
      { name: 'presets', does: 'Canonical blueprints a project starts from.' },
      {
        name: 'emit',
        does: 'Pure emitters: the ESLint config, the handbook, the agent contract.',
        layout: 'folder',
      },
      { name: 'plugin', does: 'The embedded ESLint plugin the emitted config ships inside its output.' },
      { name: 'markdown', does: 'Markdown assembly primitives shared by every emitter.' },
      { name: 'boundary', does: 'What an import does to a module boundary, and where a specifier lands.' },
      { name: 'config', does: 'The blueprint schema, its validation, and the graph derived from it.' },
    ],
  },
  // The preset's rule set, minus the two it cannot carry here:
  //
  // - `usePrefix` targets layer `hooks` by default and `validateBlueprint`
  //   throws on a layer this repo does not have. Declaring it needs a `layer`
  //   option naming something real, and no layer here is a hooks layer.
  // - `deepWatch` is Vue-only, but the guard is `framework !== 'react'` — under
  //   `auto` it would emit `blueprint/no-deep-watch` over a tree with no Vue in
  //   it. Omitted rather than declared and dead.
  rules: {
    maxLines: { tier: 'error', value: 400 },
    maxLinesPerFunction: { tier: 'warn', value: 100 },
    maxParams: { tier: 'warn', value: 3 },
    maxStatements: { tier: 'warn', value: 15 },
    complexity: { tier: 'warn', value: 12 },
    unusedVars: 'error',
    explicitAny: 'error',
    codeStyle: 'error',
    statementsPerLine: 'error',
    statementPadding: 'error',
    importBlock: 'error',
    fixtureImports: 'error',
    cycles: 'error',
    deadCode: 'error',
    testFilename: 'error',
    typedefOnlyFile: 'warn',
    usePrefixReactivity: 'warn',
  },
});
