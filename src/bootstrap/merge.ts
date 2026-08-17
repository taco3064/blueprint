import { printConfigCaveats } from './playbook';

/**
 * Method step 9's lint-merge bullet, the playbook's largest passage. Its own
 * satellite because a later flat-config entry REPLACES an earlier one, so the
 * whole passage is one argument about what a clean-reading merge can delete —
 * and the paragraphs refer back to each other in order.
 */

/**
 * The three chained paragraphs about building the combined `no-restricted-*` entry.
 * They stay together and in this order: each opens by referring to the last, and
 * this is the one place in the playbook where the order is load-bearing.
 *
 * Every clause of the recommendation is pinned by conformance, negatives included
 * — "combined one last, yours wherever it already sits" must survive and "has to
 * move up" must not come back, because reordering an existing entry silently
 * re-decides every other rule key it carries (field issue #163).
 */
function renderCombinedEntry(): string {
  return [
    '     **"ONE entry" means one per COLLISION, '
    + 'not one for the whole rule key.** emitLint scopes its entries per governed net, '
    + 'so a rule key can have several — a `selfOnly` layer with two importers emits '
    + '`no-restricted-syntax` on BOTH importer layers, '
    + 'and your own rule may overlap only one of them.',
    '     Combine with the entry you actually collide with, '
    + 'and leave the others exactly as emitted.',
    '     Widening your combined entry to cover the other nets as well is the way to get this '
    + 'wrong: it imposes YOUR rule on files it never governed, '
    + 'and one field run widened a date-guard onto a layer\'s `.js` and took 38 errors in a '
    + 'single test file that deliberately relaxes it.',
    '     Scoping it narrowly is NOT the opposite error — by the qualifier above, '
    + 'the nets you leave out keep the entry the spread emitted, unchanged.',
    '     Check the emit points before merging, not after: '
    + '`npx blueprint rules --json` lists every governed net and its selectors, '
    + 'so two importers show up as two.',
    '     A net is what one emitted entry governs, and it is not always a layer: '
    + 'flat it is exactly one per layer, and once `architecture.modules` is declared '
    + 'the list is cut per module instead and stops tracking the layer count in either '
    + 'direction — read it off that command rather than counting layers, '
    + 'and doctor names a lost one the same way.',
    '     If you get it wrong anyway, doctor\'s survival check probes every net separately and '
    + 'names the one that lost its selectors — it is a red you can act on, not a silent pass.',
    '',
    '     **How you combine, given that `...emitLint(blueprint)` is opaque.** You cannot reach '
    + 'inside the spread to edit the entry it emits, so do not try: '
    + 'write the combined entry yourself and place it LAST — after the spread, '
    + 'and after your own original entry wherever that one already sits.',
    '     That is the same later-replaces-earlier property this paragraph opens by warning about, '
    + 'used deliberately — the LAST entry to set that key on a file is the one that governs it '
    + 'there, so yours is the effective one only while nothing after it sets the key again.',
    '     Which is exactly why it has to carry everything the emitted one ENFORCED there: '
    + 'both option sets\' patterns and selectors, and the emitted `ignores`.',
    '     The ban message is the one part that is NOT among those: that text is yours to write, '
    + 'doctor compares selectors and never messages, '
    + 'so nothing here sends you into a dump to retrieve a sentence.',
    '     `rules --json` says the same beside the selectors.',
    '     **Scope is not on that list, and the two silent losses are about what the entry '
    + 'CONTAINS.** Leave blueprint\'s selectors out of an entry that matches its files and the '
    + 'ban is gone there — doctor\'s survival check turns that red.',
    '     Fold your own original entry away and keep only the combined one, '
    + 'and your rule quietly stops governing the rest of what it used to — '
    + 'doctor does not compare the rules you brought, and says so, '
    + 'which is what the probe below is for.',
    '     Confirm with `npx eslint --print-config`, '
    + 'and the affected net takes TWO probes rather than one: '
    + 'a file INSIDE the collision and a file OUTSIDE it, '
    + 'because the arrangement below deliberately makes those two resolve different entries — '
    + 'and the inside one is also what catches a wrong entry order.',
    '     Add one file your own rule governed outside that net, for the loss doctor cannot see — '
    + 'that is the whole probe. This is the one place print-config is not optional: '
    + 'doctor resolves a single path per net, '
    + 'and its ✓ says an entry scoped to part of a net is not compared, '
    + 'which is now the shape you are aiming for.',
    '',
    '     **When the two sides\' scopes were never the same, do not reconcile them — '
    + 'the collision is the entry, and neither side moves.** A house rule framed at `**/*.vue` '
    + 'folded into a net glob of `.{js,vue}` is the ordinary case: '
    + 'scope the combined entry to `**/*.vue` inside that net, '
    + 'and leave your original entry in place rather than folding it into the new one.',
    '     Three entries then cover three sets, and none of them gives a file a rule it never had: '
    + 'yours keeps the files blueprint never governed, '
    + 'the spread keeps the `.js` files your rule never governed, '
    + 'and the combined one wins where they meet.',
    '     **The placement above is what makes the three of them work, '
    + 'and it still asks nothing of the entries you have: combined one last, '
    + 'yours wherever it already sits.** Put the combined one above your original instead and '
    + 'that original wins the overlap again — your bare rule back on top, '
    + 'blueprint\'s selectors gone there.',
    '     Lifting your original entry over the spread satisfies the same ordering and is the wrong '
    + 'repair: other rule keys ride along on it, and measured, '
    + 'one that also set `no-restricted-imports` flipped from its own paths to blueprint\'s the '
    + 'moment it moved — silently, while the key you came here for looked right either way.',
    '     Say in the report which set each of the three covers.',
    '',
  ].join('\n');
}

/**
 * The `ignores` trap: a combined entry rebuilt from selector strings has no test
 * exemption unless it is written back. Separate from the merge mechanics because
 * dropping blueprint's `ignores` is silent unless a house rule collided there, and
 * doctor compares selectors rather than scope. One direction only — see
 * `renderCombinedEntry` for why the mirror case closed.
 */
function renderTestExemptions(): string {
  return [
    '     **An entry is more than its selectors — '
    + 'carry the emitted block\'s `ignores` too.** Every structural entry exempts test files, '
    + 'and a combined entry you rebuild from selector strings has no such exemption unless you '
    + 'write one.',
    '     `rules --json` gives it to you as `testExemptions` beside the selectors, '
    + 'and the text output prints the `ignores` line to paste.',
    '     Skip it and your combined entry starts governing test files: '
    + 'loud if your own rule collided there (a real run lost this and spent a debug cycle on 34 '
    + 'errors in one test file), silent if only blueprint\'s ban did — '
    + 'lint stays green while the test files it was never meant to reach are quietly under it.',
    '     Doctor compares selectors, not scope, so nothing downstream catches this.',
    '     The same move runs the other way when YOUR rule had no exemption: '
    + 'carrying blueprint\'s `ignores` onto the combined entry stops your rule at test files it '
    + 'used to govern — inside the collision only, '
    + 'and that is the second reason the paragraph above leaves your original entry in place, '
    + 'since it still governs those test files and nothing has to be given up.',
    '     Check whether the same rule appears on other nets you did NOT merge, '
    + 'because that is where an asymmetry you introduce here lands.',
    '',
    `     \`blueprint doctor\` verifies both the emitted structural rules and each declared gate's carrier rule survived the merge — so a hand sweep of the emitted gates duplicates it.`,
    `     What doctor does NOT compare is thresholds, package-ownership entries, and the survival of the rules YOU brought to the merge, and its ✓ says so.`,
    `     That remainder is what \`npx eslint --print-config <file>\` is for; a green lint run does not substitute, since it proves the config loads, not that a given rule reached a given file.`,
    `     Four things to know before reading that output${printConfigCaveats()} Run the project's own lint command; new findings introduced by the merge are fixed or explicitly judged, never left dangling — and when init wired the alias into \`tsconfig\`/\`vite\`, run the build once too (doctor's alias check reads wiring as text, never as a compile).`,
    `     Merging into a TypeScript config file (\`eslint.config.ts\`)?`,
    `     Importing \`./blueprint.config.mjs\` trips TS7016 when the tsconfig covering that file lacks \`allowJs\` — add \`allowJs: true\` there (often \`tsconfig.node.json\`), or ship a one-line \`blueprint.config.d.mts\` declaring the default export as \`Blueprint\`; name the choice in the report.`,
    `     Delete the reference once wired.`,
    `     Exception: a **legacy-format config** (\`.eslintrc.*\`) needs a flat-config/ESLint-9 migration that can break the project's own lint pipeline — do not do that unilaterally; surface it as a decision item in the report instead.`,
  ].join('\n');
}

/**
 * Method step 9's lint-merge bullet, the playbook's largest passage: a later flat-
 * config entry REPLACES an earlier one, so a merge that reads clean can delete a
 * defense while lint stays green. Not split further on purpose — its paragraphs
 * refer back to each other, so five functions would make their order load-bearing
 * while stating it nowhere.
 */
export function renderLintMerge(): string {
  return [
    '   - **Wire the lint.** If `eslint.config.blueprint.mjs` was written, '
    + 'merge it into the existing flat config: spread `...emitLint(blueprint, …)` — '
    + '**carrying its options object over whole**: `stylistic` and `imports` always, '
    + 'plus `typescript: tseslint.plugin` on TypeScript projects.',
    '     Those arguments are load-bearing, not decoration: '
    + 'five gates ride an injected plugin (`codeStyle`, '
    + '`statementsPerLine` and `statementPadding` on stylistic; `importBlock` on imports; '
    + '`explicitAny` on the TS one) and a gate whose plugin is missing emits NOTHING while lint '
    + 'still passes — a dropped argument reads exactly like a clean merge.',
    '     **Declared no gates from those families?** Pass the carriers anyway, '
    + 'and let `init` install them: that is deliberate, not over-installation.',
    '     They sit inert until a gate names them, '
    + 'and paying for them now makes turning one on a one-line edit to `blueprint.config.mjs` — '
    + 'instead of a config edit plus an install plus a second pass over this merge, '
    + 'months later, by someone who was not here.',
    '     Then resolve every rule conflict *explicitly* — house disable conventions, thresholds, '
    + 'rules an existing structure tool already enforces — and note each decision in the report.',
    '     **`codeStyle` means blueprint\'s emitted config formats this repo**, '
    + 'so a repo that already runs its own formatter is the overlapping-tool case above: '
    + 'keep ONE owner of formatting, and say which in the report.',
    '     Rules configured under the same key on both sides (`@stylistic/*`, '
    + '`padding-line-between-statements`) collide mechanically — '
    + 'flat config replaces rather than merges — so those are a wiring precondition, '
    + 'not a preference.',
    '     Before merging, run `npx blueprint impact`: '
    + 'it lints the files the emitted config governs, with only that config, '
    + 'and reports hits per rule, so every conflict is decided on numbers, '
    + 'not by reading the emitted config against the code.',
    '     Mind flat-config semantics while merging: when two entries configure the same rule, '
    + 'the later entry *replaces* the earlier **on the files both of them match** — '
    + 'nothing merges, and ordering alone cannot save a rule '
    + '**both sides set** (`no-restricted-imports`, `no-restricted-syntax`): '
    + 'whichever comes later silently deletes the other\'s defense there while lint stays green.',
    '     That qualifier is the whole merge rather than a detail of it: '
    + 'an entry does nothing at all to a file outside its own `files`, '
    + 'so the spread goes on enforcing blueprint\'s entry everywhere yours does not reach, '
    + 'and only the overlap has to be combined.',
    '     Combine both option sets into ONE entry — '
    + 'blueprint\'s patterns and selectors plus your own (`npx blueprint rules --json` carries '
    + 'the exact selfOnly selectors per governed net as `jsLiteral` — paste that field, '
    + 'quotes included, never an emitLint dump. '
    + 'Its `note` says why the rendered `selectors` value is not the same string once it is '
    + 'inside JS source; that is a silent break, '
    + 'so take the field that survives the paste rather than the one that reads more naturally).',
    '',
    renderCombinedEntry(),

    renderTestExemptions(),
  ].join('\n');
}
