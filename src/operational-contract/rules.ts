import { renderTestFilesOperational } from './test-files';
import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

export interface RuleGateFact {
  id: string;
  emits: string;
  note: string;
  fallback?: number;
  unavailable?: string;
  declared: { tier: string; value?: number } | null;
  active: boolean;
}

export interface RuleBanFact {
  layer: string;
  forbidden: string[];
  packages: string[];
  globals: string[];
  selfOnly: { target: string; selectors: string[]; jsLiteral: string[]; note: string }[];
  testExemptions: string[];
}

export interface StructuralRuleFact {
  rule: string;
  covers: string;
  active: boolean | null;
}

export interface DocumentationRuleFact {
  id: string;
  note: string;
}

export const STRUCTURAL_RULE_DESCRIPTIONS = [
  {
    rule: 'no-restricted-imports',
    covers: 'dependency flow, same-layer bans, package ownership — '
      + 'whole packages or named imports ({ package, imports }); same-signature owns merge — '
      + 'and fixture bans',
  },
  {
    rule: 'no-restricted-syntax',
    covers: 'selfOnly re-export bans — emitted only when an allowedImporters ENTRY declares '
      + 'selfOnly: true (a layer-level selfOnly key is invalid)',
  },
  {
    rule: 'no-restricted-globals',
    covers: 'global ownership (owns: [{ global: … }]) — '
      + 'emitted only where some layer is barred from an owned global',
  },
  {
    rule: 'blueprint/relative-escape',
    covers: '../ unit escapes at any depth (embedded plugin)',
  },
  {
    rule: 'blueprint/import-boundary',
    covers: 'canonical cross-boundary alias spelling and statically resolved dynamic imports '
      + '(embedded plugin)',
  },
] as const;

const PACKAGES_NOT_COMPARED = [
  '`packages` is not compared by doctor\'s survival check — a merge that drops a',
  'package ban stays green there, so verify this column yourself with',
  '`npx eslint --print-config <a file in the layer>`.',
];

type GateStatus = RuleGateFact;
type LayerBans = RuleBanFact;
type StructuralStatus = StructuralRuleFact;

export function renderRulesReport(
  catalog: {
    severity: string;
    structural: StructuralStatus[];
    gates: GateStatus[];
    bans: LayerBans[];
    docsOnly: DocumentationRuleFact[];

    testExemption?: string | null;
  },
  hasConfig: boolean,
): OperationalText {
  const { severity, structural, gates, bans, docsOnly, testExemption } = catalog;

  const status = (gate: GateStatus) => {
    if (gate.unavailable !== undefined) {
      return gate.declared === null ? '· unavailable here' : '· declared, unavailable here';
    }

    if (gate.declared === null) {
      return '· not declared';
    }

    if (!gate.active) {
      return '· off';
    }

    return `✓ ${gate.declared.tier}${gate.declared.value !== undefined ? `(${gate.declared.value})` : ''}`;
  };

  return operationalText([
    'blueprint rules — the emitted-rule catalog',
    '',

    `Structural — dependency flow & ownership · severity: ${severity} (emit.lint.severity covers only these)`,
    ...structural.map((rule) =>
      rule.active === null
        ? `  ${rule.rule.padEnd(28)} ${rule.covers}`
        : `  ${(rule.active ? '✓ emits' : '· not emitted').padEnd(16)} ${rule.rule.padEnd(28)} ${rule.covers}`),
    '',
    'Optional gates — emitted only when declared in `rules` with a tier other than off.',
    'Every gate scopes to the declared architecture file globs; module-first root containers '
    + 'are included.',

    `${gates.length} listed${unavailableNote(gates)}`,
    ...unavailableCauses(gates),

    ...(testExemption ? [`· ${testExemption}`] : []),
    ...gates.map((gate) => {
      const fallback = gate.fallback !== undefined ? ` (default ${gate.fallback})` : '';

      return `  ${status(gate).padEnd(16)} ${gate.id} → ${gate.emits}${fallback} — ${gate.note}`;
    }),
    '',
    'Documentation-only — never an ESLint line',
    ...docsOnly.map((entry) => `  ${entry.id} — ${entry.note}`),

    ...(bans.length
      ? [
          '',
          'Per-layer bans — what the structural rules enforce, resolved from this config.',

          '`no-import`, `globals` and the selfOnly selectors are what doctor compares,',
          'and it compares TEXTUALLY: a pattern group reordered or a selector respelled to',
          'an equivalent (`\\/` for `/`) reads as missing even though eslint would still',
          'enforce it. Copy, do not retype.',

          ...(bans.some((ban) => ban.packages.length) ? PACKAGES_NOT_COMPARED : []),
          ...bans.flatMap((entry) => [
            `  ${entry.layer.padEnd(14)} no-import: ${entry.forbidden.join(', ') || '(none)'}`
            + ` · packages: ${entry.packages.join(', ') || '(none)'}`
            + ` · globals: ${entry.globals.join(', ') || '(none)'}`,

            ...entry.selfOnly.flatMap((ban) => [
              `    selfOnly: no re-export from "${ban.target}" — folding your own`
              + ' no-restricted-syntax into one entry? Paste these verbatim, quotes'
              + ' included, per the caveat above — they are JS source, not values'
              + ` (${ban.note}):`,

              ...ban.jsLiteral.map((literal) => `      ${literal}`),

              `      …and carry its scope: ignores: [${
                entry.testExemptions.map((glob) => `'${glob}'`).join(', ')
              }] — ${renderTestFilesOperational('merge-scope', 'en', entry.testExemptions)}`,
            ]),
          ]),
        ]
      : []),
    ...(hasConfig
      ? []
      : ['', '(no blueprint.config.mjs — static catalog; tiers annotate once a config exists)']),
  ]);
}

function unavailableNote(gates: GateStatus[]): string {
  const out = gates.filter((gate) => gate.unavailable !== undefined);

  return out.length
    ? ` — ${out.length} of them unavailable here, which \`inspect\` and \`doctor\` `
    + 'leave out of their optional-gate count'
    : ' — none of them unavailable here, so `inspect` counts the same number';
}

function unavailableCauses(gates: GateStatus[]): string[] {
  return gates
    .filter((gate) => gate.unavailable !== undefined)
    .map((gate) => `· ${gate.id}: ${gate.unavailable}`);
}

export function renderMetricGateNote(wrap: boolean): string {
  return wrap ? 'counts code lines only (comments and blanks skipped)' : 'plain threshold';
}

export function renderSelfOnlyMessageNote(): string {
  return 'copy `jsLiteral`, not `selectors`: pasted into JS source a rendered selector '
    + 'loses its \\u002F escape and the regex ends at the bare /, silently. The ban '
    + 'message text is yours to write — doctor verifies selectors, never messages';
}

export function renderPackagesNotCompared(): string[] {
  return [...PACKAGES_NOT_COMPARED];
}
