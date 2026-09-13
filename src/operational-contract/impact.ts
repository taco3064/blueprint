export interface ImpactReportFact {
  rule: string;
  count: number;
  files: number;
  top: { path: string; count: number }[];
  kind: 'caveat' | 'foreign' | 'own';
}

export function renderImpactMissingDependency(name: string, loaderMessage: string): string {
  return `impact needs "${name}" from the project's dependencies and could not load it. `
    + `The loader said: ${loaderMessage}\n`
    + `If that names a DIFFERENT package, "${name}" itself is here and its own dependency `
    + `tree is not: a full install of the project fills that, adding "${name}" again does `
    + 'not. (`blueprint init` lists it among the required deps.)';
}

export function renderImpactMissingConfig(): string {
  return 'impact measures the rules of an authored blueprint.config.mjs — author the config first '
    + '(`blueprint init`, or the authoring playbook on a brownfield repo).';
}

export function renderImpactReport(
  impacts: ImpactReportFact[],
  total: number,
  linted: number,
): string {
  const own = impacts.filter((impact) => impact.kind === 'own');
  const caveats = impacts.filter((impact) => impact.kind === 'caveat');
  const foreign = impacts.filter((impact) => impact.kind === 'foreign');

  const rows = (list: ImpactReportFact[]) =>
    list.flatMap((impact) => [
      `  ${String(impact.count).padStart(5)}  ${impact.rule} — ${impact.files} file(s)`,
      `         worst: ${impact.top.map((entry) =>
        `${entry.path} (${entry.count})`).join(', ')}`,
    ]);

  const caveatBlock = !caveats.length
    ? []
    : [
        '',
        'Isolation caveats — not wiring-introduced red, never counted above:',
        '(`unused-disable-directive`: the disable suppresses nothing HERE — one',
        'for a rule your real config turns ON vanishes after the merge, a truly',
        'stale one survives it; `parse-error`: the file could not be parsed and',
        'its numbers are untrustworthy. Verify both against your full lint.)',
        '',
        ...rows(caveats),
      ];

  const foreignBlock = !foreign.length
    ? []
    : [
        '',
        'Names YOUR OWN config owns — NOT blueprint findings, NEVER counted:',
        'this run configures the emitted rules and nothing else, so a row here',
        'is a name your CODE carries: an `eslint-disable` (or inline config)',
        'comment naming a house rule. ESLint reports the name it cannot resolve',
        'AT THAT COMMENT, so a count here counts mentions — not violations, and',
        'not a verdict on the code beneath one; a row beside a blueprint hit is',
        'not a second finding. The ROWS leave this report once emitLint merges',
        'into your real config. Your rule does not: defined again there, it',
        'judges that code itself, disable comments honored.',
        '',
        ...rows(foreign),
      ];

  if (!own.length) {
    return [
      linted === 0
        ? '✓ Rule impact: 0 hits — vacuous: the architecture globs match no files, so no '
        + 'rule ever ran. Wiring emitLint introduces no red today, and proves '
        + 'nothing until code lands in a layer.'
        : '✓ Rule impact: 0 hits — wiring emitLint introduces no red today.',
      '  (scope: emitLint only — the anti-bypass guard is separate; the '
      + 'project\'s own lint judges its findings)',
      ...caveatBlock,
      ...foreignBlock,
    ].join('\n');
  }

  return [
    'Rule impact — what wiring emitLint would flag today',
    '',
    ...rows(own),
    '',
    `${total} hit(s). These numbers decide tiers, not just suppressions: a rule`
    + ' you would suppress everywhere is often better declared `warn` (or `off`)'
    + ' in the blueprint — its `rules` tier, or `emit.lint.severity` for the'
    + ' structural family. Judge each rule, then wire the config and lock only'
    + ' what remains with `npx eslint . --suppress-all` — new violations still fail.',
    ...caveatBlock,
    ...foreignBlock,
  ].join('\n');
}
