/**
 * This repo's own blueprint — blueprint governed by what blueprint publishes.
 *
 * It imports NOTHING, on purpose. `@kekkai/blueprint` resolves through this
 * package's own `exports` to `./dist/index.js`, so a config written that way
 * would describe whatever was last built; and the file that reads this one is
 * plain Node (`src/project/resolve.ts` — a bare dynamic `import`, no
 * transpiler), which cannot import `src` at all (`ERR_UNSUPPORTED_DIR_IMPORT`).
 * A plain object literal is the only shape that is true from both ends.
 *
 * Skipping `defineBlueprint` costs the type annotation and nothing else:
 * `resolveBlueprint` runs `validateBlueprint` on every load, and the JSDoc
 * below restores the annotation for `tsc` (`blueprint.config.mjs` is in
 * `tsconfig.lib.json`'s `include`, so `npm run tsc` type-checks this file).
 *
 * @type {import('./src').Blueprint}
 */
export default {
  name: '@kekkai/blueprint',
  // Not a front-end app. `auto` is the widest layer glob
  // (`*.{js,jsx,ts,tsx,vue}`) rather than a claim that this repo uses React or
  // Vue — naming a framework here would emit that framework's rules over a tree
  // that has none of it.
  framework: 'auto',
  architecture: {
    /*
     * DECLARED AND WIRED, DELIBERATELY UNUSED — and the reason is measured, not
     * argued. `tsc` does not rewrite path mappings, so an aliased import inside
     * `src/` lands verbatim in the per-file declarations `tsconfig.types.json`
     * emits; a consumer type-checking against `dist/` then gets
     * `TS2307: Cannot find module '~lib/…'`. Reproduced by aliasing one import
     * in `src/emit/agent/agent.ts`, building, and type-checking a throwaway
     * consumer of `dist/index.js` with `skipLibCheck: false`.
     *
     * The consequence is the debt below: `blueprint/relative-escape` reports
     * every cross-module relative import in `src/` (110 today), and the fix is
     * NOT to alias them. It is either a build step that rewrites the mappings,
     * or the rule learning that a published library is a different case.
     * Recorded in `.blueprint-baseline.json` / `eslint-suppressions.json`,
     * not silenced here.
     *
     * `~lib`, not the presets' `~app`: this is a published Node library, and
     * the alias names the import root rather than repeating the package name.
     */
    alias: '~lib',
    // Explicit rather than defaulted: `eslint.config.ts` reads this key to
    // derive the house entry's `ignores`, and an omitted one reads `undefined`.
    sourceRoot: 'src',
    /*
     * CLAUDE.md's "Layering (one-way, low → high)" line, reversed — blueprint
     * declares layers high → low, since a layer may import only layers declared
     * AFTER it.
     *
     * Two things a later reader should not have to rediscover:
     *
     * - `survey` before `impact` is arbitrary. Neither imports the other; the
     *   order follows CLAUDE.md's prose so the two documents cannot drift.
     * - `markdown` before `boundary` is NOT arbitrary, though neither imports
     *   the other either. Declared this way round, `boundary` may reach only
     *   `config`, which is what it should ever need; the other way round it
     *   would be free to render markdown, and a judgment that can format its
     *   own answer is one step from owning the message.
     * - No layer declares `allowedImporters`, so every downward edge is legal.
     *   That is the honest starting state, not a finished contract: every count
     *   measured against this config is a LOWER BOUND on what a narrowed
     *   version would report.
     */
    layers: [
      {
        name: 'cli',
        does: 'Argv dispatch: parses the command line, routes to a runtime, owns the usage text and the process exit code.',
      },
      {
        name: 'bootstrap',
        does: 'The `init` runtime — plan (pure) and apply (I/O), toolchain wiring, the authoring playbook, and the agent launcher.',
      },
      {
        name: 'survey',
        does: 'The `survey` runtime — folder-by-folder evidence for authoring a blueprint on a repo that has none yet. Reports facts, never judges.',
      },
      {
        name: 'impact',
        does: 'The `impact` runtime — runs the emitted config through the project\'s own ESLint and reports hits per rule. Informational, never a gate.',
      },
      {
        name: 'inspect',
        does: 'The read-only runtimes — scan, analyze, doctor, deps, rules, coverage, the baseline ledger, and the report renderer.',
      },
      {
        name: 'project',
        does: 'The shared reader for both runtimes: detect the stack and its toolchain files, load and validate the config, or fall back to a preset.',
      },
      {
        name: 'presets',
        does: 'The canonical Vue / React / Next blueprints — the published architecture, as data.',
      },
      {
        name: 'emit',
        does: 'The pure emitters: the ESLint flat config (`lint/`), the handbook and its diagrams (`docs/`), and the agent-contract files (`agent/`).',
      },
      {
        name: 'plugin',
        does: 'The embedded ESLint plugin — six rule objects the built-in no-restricted-* family cannot express, shipped inside the emitted config.',
      },
      {
        name: 'markdown',
        does: 'Markdown rendering primitives shared by the emitters: tables, cell escaping, `owns` formatting, and marker injection.',
      },
      {
        name: 'boundary',
        does: 'What an import does to a module boundary, and where a specifier lands — the one judgment `inspect`\'s findings and the embedded lint rules both read.',
      },
      {
        name: 'config',
        does: 'The Blueprint schema and its validator, the layer-graph derivations, and the rule-setting reader.',
      },
    ],
  },
  /*
   * No agent files. This repo's `CLAUDE.md` is hand-written and #358 asks for
   * the lint gates, not the prose artifacts — an emitted contract would either
   * overwrite that document or fight it. `principles` / `componentShape` /
   * `playbook` are absent for the same reason: their only destinations are the
   * handbook and the agent contract, and neither is emitted here.
   *
   * `[]` is not the same as omitting the key — the default is
   * `['claude', 'agents']`. And an unmarked hand-written `CLAUDE.md` is not
   * reported as a stale contract: `staleContracts` counts a `merge` target only
   * when the file carries the `<!-- BLUEPRINT:START -->` marker, which this one
   * does not.
   */
  emit: { agents: [] },
  /*
   * The presets' rule block, minus exactly two — each dropped because it cannot
   * mean anything on a repo of this shape, never to make a gate easier.
   *
   * - `usePrefix` defaults to the `hooks` layer, and `validateBlueprint` throws
   *   on a layer this repo does not have. Declaring it against some other layer
   *   would be inventing a convention to keep a row.
   * - `deepWatch`'s emit guard is `framework !== 'react'`, so under `auto` it
   *   would emit `blueprint/no-deep-watch` over a tree with no Vue in it.
   */
  rules: {
    maxLines: { tier: 'error', value: 400 },
    maxLinesPerFunction: { tier: 'warn', value: 100 },
    maxParams: { tier: 'warn', value: 3 },
    maxStatements: { tier: 'warn', value: 15 },
    complexity: { tier: 'warn', value: 12 },
    unusedVars: 'error',
    explicitAny: 'error',
    // `maxLen: 100` is this repo's own cap, set in `eslint.config.ts` long
    // before this ticket — declaring it here moves the existing number under
    // the gate rather than re-deciding it. The preset's bare `'error'` would
    // have meant 90, which is a reformat, not a governance change.
    codeStyle: { tier: 'error', maxLen: 100 },
    statementsPerLine: 'error',
    statementPadding: 'error',
    importBlock: 'error',
    fixtureImports: 'error',
    cycles: 'error',
    deadCode: 'error',
    testFilename: 'error',
    usePrefixReactivity: 'warn',
    typedefOnlyFile: 'warn',
  },
};
