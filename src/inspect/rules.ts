import { detect, resolveBlueprint } from '../project';
import type { ResolveOptions } from '../project';
// Import from the patterns leaf, not the emit/lint index — the index also
// exports lint.ts, which loads the plugin, which shares resolve logic with
// inspect; routing through the index would close a module cycle.
import {
  DOC_ONLY_RULES,
  deriveGlobalRules,
  derivePackageRules,
  METRIC_GATES,
  PLUGIN_GATES,
  unavailableGate,
  selfOnlyReexportSelector,
  resolveTestFiles,
} from '../emit/lint/patterns';
import type { GateSpec } from '../emit/lint/patterns';
import {
  aliasLayerRoots,
  getForbiddenLayers,
  getSelfOnlyTargets,
  normalizeAllowedImporters, readSetting,
} from '../config';
import type { Blueprint } from '../config';

/**
 * `blueprint rules` — the emitted-rule catalog as a queryable command. Field
 * agents reverse-engineered this exact table from the minified bundle
 * ("which rules always emit, which need declaring, the defaults") — the
 * compiler model demands the tool answer for itself. With a config present,
 * every gate is annotated with what the blueprint actually declares.
 */

export interface RulesOptions {
  /** Emit machine-readable JSON instead of the text catalog. */
  json?: boolean;
  /** Output sink (default `console.log`). */
  log?: (message: string) => void;
  /** Load an existing blueprint.config (default dynamic import). */
  loadConfig?: ResolveOptions['loadConfig'];
}

/**
 * One always-on structural rule. Not part of the package entry: no public
 * API returns this shape — it travels only inside the `--json` output.
 */
export interface StructuralRule {
  rule: string;
  covers: string;
}

/**
 * One layer's resolved bans — what the structural rules actually enforce
 * there. Field agents answered "is the rule really wired?" by parsing
 * `eslint --print-config` output by hand (issue #7); this is that view,
 * derived from the same primitives emitLint compiles from.
 */
export interface LayerBans {
  layer: string;
  /** Layers this one must not import. */
  forbidden: string[];
  /** Owned packages banned here (named imports in parentheses). */
  packages: string[];
  /**
   * Why this column needs verifying by hand — present only where `packages` is, since a
   * layer banning nothing has nothing to check. Beside the field it is about rather than
   * once at the top: a consumer reading `bans[i].packages` has no reason to look at a
   * sibling key, which is how the text output and `--json` came to disagree.
   */
  packagesNote?: string;
  /** Owned globals banned here. */
  globals: string[];
  /**
   * The selfOnly re-export bans emitted on this layer's files — the exact
   * `no-restricted-syntax` selector per (target, alias). A merge that folds
   * blueprint's entry into the project's own used to have no supported
   * source for these strings but an emitLint dump (field issue #20).
   *
   * `selectors` is the value ESLint resolves and doctor compares — right for a
   * program writing config, and a trap for the paste this catalog exists to
   * serve. The separators are `/` escapes (a raw `/` would end esquery's
   * regex early), and JS resolves that escape when it parses a string literal:
   * paste the rendered value into `'…'` and the selector silently becomes
   * `/^@/contexts//`, a regex that ends at the bare `/`. No parse error, lint
   * still green, and doctor's red then reads like the false alarm it warns about
   * ("an equivalent respelling"), which this is not. `jsLiteral` is the same
   * selector as JS source, quotes included, so the paste survives (field run
   * #125 verified both halves).
   *
   * `note` carries that and the one thing a fold must NOT copy at all. It
   * repeats per entry rather than sitting once at the top because an agent
   * arrives here looking for selectors to copy, and a caveat has to be where the
   * copy happens — the message half reached only the text output for three
   * releases, so the same doubt came back through the channel the playbook points
   * at (field issue #117).
   */
  selfOnly: { target: string; selectors: string[]; jsLiteral: string[]; note: string }[];
  /**
   * The test-exemption globs the emitted entry carries alongside these bans.
   * Rebuilding a combined `no-restricted-syntax` entry from `selectors` alone
   * silently drops it, and the loss is quiet in the worst way: the merged
   * entry goes on linting, so a house rule starts reaching test files, and
   * blueprint's own selfOnly ban does too where nothing collided to make a
   * noise (field issue #60). Carry it onto whatever entry the selectors land
   * in.
   */
  testExemptions: string[];
}

/** One optional gate, annotated with the resolved config when present. */
export interface GateStatus {
  id: string;
  /** The ESLint rule it emits — or the runtime that enforces it instead. */
  emits: string;
  note: string;
  /** Metric fallback threshold, when the gate is one of the metric family. */
  fallback?: number;
  /**
   * Why this stack cannot open the gate — absent when it can. It is the difference
   * between this catalog's row count and the `N/M optional gates` denominator
   * `inspect` and `doctor` print: a gate nothing can open is left out of theirs and
   * listed here, so a reader comparing the two numbers is told which, instead of
   * inferring it (field run #137 inferred the wrong one).
   */
  unavailable?: string;
  /** The declared setting, resolved — null when the config does not declare it. */
  declared: { tier: string; value?: number } | null;
  /** Whether the emitted config would carry it today. */
  active: boolean;
}

/**
 * One string for both output shapes, so the text form and `--json` cannot drift
 * into disagreeing about the same fold. It names the fields rather than saying
 * "these", because the text reader learns from it which of the two `--json`
 * carries is the one to take.
 */
/**
 * What doctor's survival check does NOT compare, in the one string both shapes carry.
 *
 * The text block used to close with "Everything below is what doctor compares" while
 * the block below it prints a `packages:` column and doctor's own ✓ says
 * package-ownership entries are not compared (field run #159). Naming the columns fixed
 * the text and left `--json` a bare `string[]` — which is exactly #117's shape: the text
 * gets the caveat, the JSON does not, and the same doubt returns from the other channel a
 * few releases later. The playbook sends a folding agent to `rules --json` in five
 * places, so that channel is not the secondary one.
 *
 * Stated as a fact about the check rather than as "doctor says so on that check": four of
 * that check's five outcomes print no scope at all (not wired, no probe derivable, config
 * unresolvable, and the red), and `rules` prints this block whenever a config exists — so
 * pointing at a line of another command's output points at nothing in most repos.
 */
const PACKAGES_NOT_COMPARED
  = 'doctor\'s survival check does not compare package ownership — a merge that drops a '
    + 'package ban stays green there, so verify this column yourself with '
    + '`npx eslint --print-config <a file in the layer>`';

const SELF_ONLY_MESSAGE_NOTE
  = 'copy `jsLiteral`, not `selectors`: pasted into JS source a rendered selector '
    + 'loses its \\u002F escape and the regex ends at the bare /, silently. The ban '
    + 'message text is yours to write — doctor verifies selectors, never messages';

export const STRUCTURAL_RULES: StructuralRule[] = [
  { rule: 'no-restricted-imports', covers: 'dependency flow, same-layer bans, package ownership — whole packages or named imports ({ package, imports }); same-signature owns merge — and fixture bans' },
  { rule: 'no-restricted-syntax', covers: 'selfOnly re-export bans — emitted only when an allowedImporters ENTRY declares selfOnly: true (a layer-level selfOnly key is invalid)' },
  { rule: 'no-restricted-globals', covers: 'global ownership (owns: [{ global: … }]) — emitted only where some layer is barred from an owned global' },
  { rule: 'blueprint/relative-escape', covers: '../ module escapes at any depth (embedded plugin)' },
];

/** A structural rule annotated with whether THIS config's output carries it. */
export interface StructuralStatus extends StructuralRule {
  /** null without a config (static catalog); resolved boolean with one. */
  active: boolean | null;
}

/**
 * Whether each structural rule would appear in the emitted config — the
 * question a field agent could only answer by calling emitLint and dumping
 * its entries (issue #14: docs said "emits", the config didn't). Mirrors
 * emitLint's conditions from the same primitives — rules.ts must not import
 * lint.ts (module cycle, see the import note above), so the mirror is
 * pinned to emitLint's real output by a test instead.
 */
function resolveStructural(blueprint: Blueprint | null): StructuralStatus[] {
  if (!blueprint) return STRUCTURAL_RULES.map((rule) => ({ ...rule, active: null }));

  const { layers } = blueprint.architecture;
  const globalRules = deriveGlobalRules(layers);

  const active: Record<string, boolean> = {
    'no-restricted-imports': true,
    'blueprint/relative-escape': true,
    'no-restricted-syntax': layers.some((layer) =>
      normalizeAllowedImporters(layer.allowedImporters)
        .some((importer) => importer.selfOnly === true)),
    'no-restricted-globals': layers.some((layer) =>
      globalRules.some((rule) => !rule.allowedIn.includes(layer.name))),
  };

  return STRUCTURAL_RULES.map((rule) => ({ ...rule, active: active[rule.rule] }));
}

function gateSpecs(): GateSpec[] {
  return [
    ...METRIC_GATES.map((gate) => ({
      id: gate.id,
      emits: gate.rule,
      // `wrap` is the gates' one real behavioral split — say it, instead of
      // a filler label ("metric family") that answers nothing.
      note: gate.wrap ? 'counts code lines only (comments and blanks skipped)' : 'plain threshold',
      fallback: gate.fallback,
    })),
    ...PLUGIN_GATES,
  ];
}

/** Every layer's resolved bans, from the same primitives emitLint uses. */
function layerBans(blueprint: Blueprint): LayerBans[] {
  const { architecture } = blueprint;

  const aliases = aliasLayerRoots(architecture)
    .map((root) => [root.alias, ...root.prefix].join('/'));

  const packageRules = derivePackageRules(architecture.layers);
  const globalRules = deriveGlobalRules(architecture.layers);

  return architecture.layers.map((layer) => {
    const packages = packageRules
      .filter((rule) => !rule.allowedIn.includes(layer.name))
      .map((rule) => (rule.imports?.length ? `${rule.package} (${rule.imports.join(', ')})` : rule.package));

    return {
      layer: layer.name,
      forbidden: getForbiddenLayers(architecture, layer.name),
      packages,
      ...(packages.length ? { packagesNote: PACKAGES_NOT_COMPARED } : {}),
      globals: globalRules
        .filter((rule) => !rule.allowedIn.includes(layer.name))
        .map((rule) => rule.global),
      selfOnly: getSelfOnlyTargets(architecture, layer.name).map((target) => {
        const selectors = aliases.map((alias) => selfOnlyReexportSelector(alias, target));

        return {
          target,
          selectors,
          // JSON's string escaping IS JavaScript's here, so stringify is the paste
          // form rather than a hand-rolled doubling of backslashes — and it brings
          // the quotes, which is what makes it obvious it is source, not a value.
          jsLiteral: selectors.map((selector) => JSON.stringify(selector)),
          note: SELF_ONLY_MESSAGE_NOTE,
        };
      }),
      testExemptions: resolveTestFiles(architecture.testFiles),
    };
  });
}

/**
 * How this catalog's row count reconciles with the `N/M optional gates` denominator
 * `inspect` and `doctor` print. Two authoritative outputs differing by one, with
 * neither naming the one, is the shape of the defect this closes.
 */
function unavailableNote(gates: GateStatus[]): string {
  const out = gates.filter((gate) => gate.unavailable !== undefined);

  if (!out.length) return ' — all of them openable on this stack, so `inspect` counts the same number';

  return ` — ${out.length} of them unavailable on this stack (${
    out.map((gate) => `${gate.id}: ${gate.unavailable}`).join('; ')
  }), which \`inspect\` and \`doctor\` leave out of their optional-gate count`;
}

function resolveGate(
  spec: GateSpec,
  blueprint: Blueprint | null,
  hasTypescript: boolean,
): GateStatus {
  const setting = blueprint?.rules?.[spec.id];

  const read = setting === undefined ? null : readSetting(setting);

  const declared = read === null
    ? null
    : { tier: read.tier, ...(read.value !== undefined ? { value: read.value } : {}) };

  // Whether this stack can open the gate at all, from the same function inspect's
  // denominator reads — this used to mirror only the React case, so a JS project saw
  // `explicitAny` here as an ordinary gate and `0/17 optional gates` there, with
  // nothing to reconcile them (field run #137).
  const unavailable = unavailableGate(
    spec.id,
    blueprint?.framework,
    hasTypescript,
    blueprint?.architecture.testFiles,
  );

  return {
    ...spec,
    declared,
    ...(unavailable !== null ? { unavailable } : {}),
    active: declared !== null && declared.tier !== 'off' && unavailable === null,
  };
}

/**
 * Run `blueprint rules` in `root`. Read-only and config-optional: without a
 * config it prints the static catalog; with one, every gate is annotated
 * with the declared tier and whether it emits today.
 * @group Runtimes
 * @example
 * const { gates } = await runRules(process.cwd());
 *
 * console.log(gates.filter((gate) => gate.active).map((gate) => gate.id));
 */
export async function runRules(
  root: string,
  options: RulesOptions = {},
): Promise<{ severity: string; gates: GateStatus[]; bans: LayerBans[] }> {
  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);

  const blueprint = state.hasConfig
    ? (await resolveBlueprint(root, state, options)).blueprint
    : null;

  const severity = blueprint?.emit?.lint?.severity ?? 'error';
  const structural = resolveStructural(blueprint);
  const gates = gateSpecs().map((spec) => resolveGate(spec, blueprint, state.hasTypescript));
  const bans = blueprint ? layerBans(blueprint) : [];

  log(
    options.json
      ? JSON.stringify({
          severity,
          structural,
          gates,
          bans,
          docsOnly: DOC_ONLY_RULES,
        }, null, 2)
      : renderRules(severity, structural, gates, bans, blueprint !== null),
  );

  return { severity, gates, bans };
}

/** The human-readable catalog. */
export function renderRules(
  severity: string,
  structural: StructuralStatus[],
  gates: GateStatus[],
  bans: LayerBans[],
  hasConfig: boolean,
): string {
  const status = (gate: GateStatus) => {
    // Outranks the tier, and keeps the declared/undeclared split it used to carry as
    // "never emits here": whether the author set it still matters — declared means a
    // line in their config does nothing, undeclared means adding one would. What the
    // old wording lost is WHY, which the reconciliation line above now names.
    if (gate.unavailable !== undefined) {
      return gate.declared === null ? '· unavailable here' : '· declared, unavailable here';
    }

    if (gate.declared === null) return '· not declared';

    // Declared, not unavailable, and still inactive means exactly one thing: the
    // author set it to off. The other arm this ternary used to have — "declared,
    // never emits here" — existed only for the framework-silenced case, which the
    // unavailable branch above now answers with its reason, so nothing reaches it.
    if (!gate.active) return '· off';

    return `✓ ${gate.declared.tier}${gate.declared.value !== undefined ? `(${gate.declared.value})` : ''}`;
  };

  return [
    'blueprint rules — the emitted-rule catalog',
    '',
    // "Always emitted" was a lie for two of the four (field issue #14) —
    // with a config, each line states whether THIS config carries it.
    `Structural — dependency flow & ownership · severity: ${severity} (emit.lint.severity covers only these)`,
    ...structural.map((rule) =>
      rule.active === null
        ? `  ${rule.rule.padEnd(28)} ${rule.covers}`
        : `  ${(rule.active ? '✓ emits' : '· not emitted').padEnd(16)} ${rule.rule.padEnd(28)} ${rule.covers}`),
    '',
    'Optional gates — emitted only when declared in `rules` with a tier other than off.',
    'Every gate scopes to the layer file globs — root wiring sits outside all of them.',
    // The row count against inspect's denominator, stated rather than left to
    // subtraction: they differ by exactly the gates this stack cannot open, and a
    // field agent comparing 18 rows to `0/17 optional gates` had to guess which one
    // and guessed wrong (field run #137).
    `${gates.length} listed${unavailableNote(gates)}`,
    ...gates.map((gate) => {
      const fallback = gate.fallback !== undefined ? ` (default ${gate.fallback})` : '';

      return `  ${status(gate).padEnd(16)} ${gate.id} → ${gate.emits}${fallback} — ${gate.note}`;
    }),
    '',
    'Documentation-only — never an ESLint line',
    ...DOC_ONLY_RULES.map((entry) => `  ${entry.id} — ${entry.note}`),
    // "0 hits" has two readings — wired-and-clean, or not applying at all.
    // The resolved per-layer view answers which, without print-config
    // archaeology (field issue #7).
    ...(bans.length
      ? [
          '',
          'Per-layer bans — what the structural rules enforce, resolved from this config.',
          // Named columns, not "everything below". That sentence claimed doctor's
          // comparison covers this whole block, and doctor's own ✓ says the opposite
          // about one column of it — "package-ownership entries … are not compared".
          // A field agent quoted both lines side by side: two live command outputs
          // giving a merge opposite instructions about whether the packages column
          // still needs verifying by hand (field run #159). The scope belongs to the
          // check that has it; this says which of ITS columns fall inside, and what
          // to do about the one that does not.
          '`no-import`, `globals` and the selfOnly selectors below are what doctor compares,',
          'and it compares TEXTUALLY: a pattern group reordered or a selector respelled to',
          'an equivalent (`\\/` for `/`) reads as missing even though eslint would still',
          'enforce it. Copy, do not retype.',
          `\`packages\` is NOT compared: ${PACKAGES_NOT_COMPARED}.`,
          ...bans.flatMap((entry) => [
            `  ${entry.layer.padEnd(14)} no-import: ${entry.forbidden.join(', ') || '(none)'}`
            + ` · packages: ${entry.packages.join(', ') || '(none)'}`
            + ` · globals: ${entry.globals.join(', ') || '(none)'}`,
            // The exact strings a merge fold needs — printing them here is
            // what keeps "combine into ONE entry" doable without an emitLint
            // dump (field issue #20). The message caveat closes the follow-up
            // doubt (#23): doctor compares selectors only, by design. It reached
            // only this text form for three releases, so #117 raised #23 again
            // from `--json` — which is the channel the playbook's merge step
            // sends a folding agent to. Both carry the one string now.
            //
            // "Verbatim" needs its reason, and the header above carries it —
            // doctor's comparison is textual, which wiring said only once it had
            // already gone red. A field agent deciding how to write an escape
            // (`\/` against the emitted `/`, the same string at runtime) could
            // not tell whether a respelling would read as missing, and
            // over-constrained defensively (#101).
            ...entry.selfOnly.flatMap((ban) => [
              `    selfOnly: no re-export from "${ban.target}" — folding your own`
              + ' no-restricted-syntax into one entry? Paste these verbatim, quotes'
              + ' included, per the caveat above — they are JS source, not values'
              + ` (${ban.note}):`,
              // The literal, not the value: this line exists to be copied into a
              // config, and the value does not survive that copy (field run #125).
              ...ban.jsLiteral.map((literal) => `      ${literal}`),
              // The selectors alone are not the whole entry. The emitted block
              // exempts test files, and an entry rebuilt from selectors carries
              // no such thing — the merged rule then reaches tests, loudly if a
              // house rule collided there, silently if only blueprint's ban did
              // (field issue #60).
              `      …and carry the exemption the emitted block has: ignores: [${
                entry.testExemptions.map((glob) => `'${glob}'`).join(', ')
              }] — without it your combined entry lints test files that this ban never covered`,
            ]),
          ]),
        ]
      : []),
    ...(hasConfig
      ? []
      : ['', '(no blueprint.config.mjs — static catalog; tiers annotate once a config exists)']),
  ].join('\n');
}
