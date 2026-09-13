import {
  renderDivergentReadingClause,
  renderOutOfScanReachClause,
  renderOwnersCallClause,
} from './lint';
import type { GlobReachFact } from './lint';

export interface DoctorCheckView {
  label: string;
  ok: boolean;
  detail?: string;
  skipped?: string;
}

export type DoctorCheckFact
  = | { kind: 'config'; present: boolean }
    | { kind: 'suppressions'; status: 'unused' | 'valid' }
    | { kind: 'suppressions'; status: 'invalid-json' }
    | { kind: 'suppressions'; status: 'stale'; files: string[] }
    | { kind: 'suppressions'; status: 'empty' }
    | { kind: 'alias'; aliases: string[]; sourceRoot?: string; unreadable?: string }
    | { kind: 'leftovers'; references: string[]; authoring: string[]; stale: string[] }
    | { kind: 'eslint-wired'; wired: boolean; legacyConfig?: string }
    | { kind: 'lint-entrypoint'; reachable: true }
    | {
      kind: 'lint-entrypoint';
      reachable: false;
      reason: 'missing-lint' | 'unreachable';
      entrypoint?: string;
    }
    | { kind: 'live-lint'; status: 'unreachable' }
    | { kind: 'live-lint'; status: 'unverified'; command?: string; reason: string }
    | {
      kind: 'live-lint';
      status: 'passed' | 'failed';
      command: string;
      errors: number;
      warnings: number;
      reason?: string;
    }
    | {
      kind: 'architecture';
      fresh: number;
      hasErrors: boolean;
      suppressed: number;
      coverage: string;
      vacuous?: { sourceFiles: number; nextStep: string };
    }
    | { kind: 'wiring-unwired' }
    | { kind: 'wiring-no-probe'; label: string }
    | { kind: 'wiring-unresolvable'; label: string; merged: boolean; reason: string }
    | { kind: 'wiring-lost'; label: string; lost: string[] }
    | { kind: 'wiring-survives'; label: string; scope: string; unreadable: number };

export function renderUnreachedIgnoreNote(fact: {
  globs: string[];
  reach: GlobReachFact[];
  probed: boolean;
}): string {
  const repoWideThere = 'it is unreached only here, and the config `emit/lint` emits '
    + 'still applies it wherever it does match';

  const tail = renderOutOfScanReachClause(fact.reach, repoWideThere)
    + renderOwnersCallClause(fact.reach, {
      opening: 'Inside the scanned tree a mistyped glob and a convention',
      noun: 'exclusion',
    })
    + renderDivergentReadingClause(fact.reach);

  return '`architecture.layerFilesIgnore` — no file here matches '
    + `${fact.globs.map((glob) => `\`${glob}\``).join(', ')}, and neither does the stand-in `
    + 'path doctor uses to probe a layer that has none. So nothing this run read is held '
    + 'out through it: no scanned file is dropped from the layers'
    + (fact.probed
      ? ', and doctor\'s merge-survival check picks its probe as if the entry were absent'
      : '')
    + '. That is this scan\'s reach, not a verdict on the entry — `emit/lint` copies it '
    + 'into ESLint\'s `ignores` verbatim, and an entry carrying no `files` beside it is a '
    + `repo-wide ignore there${tail}.`;
}

type AdoptionCheckFact = Extract<DoctorCheckFact, {
  kind: 'config' | 'suppressions' | 'alias' | 'leftovers' | 'eslint-wired' | 'lint-entrypoint';
}>;
type RuntimeCheckFact = Extract<DoctorCheckFact, { kind: 'live-lint' | 'architecture' }>;
type WiringCheckFact = Extract<DoctorCheckFact, { kind: `wiring-${string}` }>;

const SUPPRESSIONS_FILE = 'eslint-suppressions.json';

export function renderDoctorCheck(fact: DoctorCheckFact): DoctorCheckView {
  if (['config', 'suppressions', 'alias', 'leftovers', 'eslint-wired', 'lint-entrypoint']
    .includes(fact.kind)) {
    return renderAdoptionCheck(fact as AdoptionCheckFact);
  }

  return fact.kind.startsWith('wiring-')
    ? renderWiringCheck(fact as WiringCheckFact)
    : renderRuntimeCheck(fact as RuntimeCheckFact);
}

function renderAdoptionCheck(fact: AdoptionCheckFact): DoctorCheckView {
  switch (fact.kind) {
    case 'config':
      return fact.present
        ? { label: 'blueprint.config.mjs present', ok: true }
        : {
            label: 'blueprint.config.mjs present',
            ok: false,
            detail: 'run `blueprint init` (or `init --topology layer-first --authoring`) first',
          };
    case 'suppressions':
      return renderSuppressions(fact);
    case 'alias':
      return renderAlias(fact);
    case 'leftovers':
      return renderLeftovers(fact);
    case 'eslint-wired':
      return {
        label: 'eslint wired to emitLint',
        ok: fact.wired,
        detail: fact.wired
          ? undefined
          : fact.legacyConfig
            ? `${fact.legacyConfig} is legacy — migrate to flat config, then spread ...emitLint(blueprint)`
            : 'spread ...emitLint(blueprint) into your eslint config (see '
              + 'eslint.config.blueprint.mjs)',
      };
    case 'lint-entrypoint':
      return {
        label: 'normal lint entrypoint reaches eslint',
        ok: fact.reachable,
        detail: fact.reachable
          ? undefined
          : fact.reason === 'missing-lint'
            ? 'package.json has no `lint` script — add one that runs eslint so the generated '
            + 'architecture rules execute on the normal lint path'
            : `package.json lint runs \`${fact.entrypoint}\`, but no reachable delegated `
              + 'script runs eslint — wire eslint into lint or an ordinary npm/pnpm/yarn '
              + 'script it calls',
      };
  }
}

function renderRuntimeCheck(fact: RuntimeCheckFact): DoctorCheckView {
  switch (fact.kind) {
    case 'live-lint':
      return renderLiveLint(fact);
    case 'architecture':
      return renderArchitectureCheck(fact);
  }
}

function renderArchitectureCheck(
  fact: Extract<DoctorCheckFact, { kind: 'architecture' }>,
): DoctorCheckView {
  let detail = fact.coverage;

  if (fact.hasErrors) {
    detail = fact.suppressed > 0
      ? `${fact.fresh} finding(s) outside the baseline — fix, or \`blueprint inspect --update-baseline\``
      : `${fact.fresh} finding(s) — fix, or lock as accepted debt: \`blueprint inspect --update-baseline\``;
  } else if (fact.vacuous) {
    detail = `clean, but vacuous — architecture globs match 0 of ${fact.vacuous.sourceFiles} source file(s); the wiring is done — ${fact.vacuous.nextStep}`;
  }

  return {
    label: fact.suppressed > 0
      ? 'architecture clean (findings covered by the baseline)'
      : 'architecture clean',
    ok: !fact.hasErrors,
    detail,
  };
}

function renderWiringCheck(fact: WiringCheckFact): DoctorCheckView {
  switch (fact.kind) {
    case 'wiring-unwired':
      return {
        label: 'emitted rules survive the eslint config (skipped — eslint not wired)',
        ok: true,
        skipped: 'eslint not wired — the wiring check above is the red for that',
      };
    case 'wiring-no-probe':
      return {
        label: `${fact.label} (skipped — no probe derivable from the architecture globs)`,
        ok: true,
      };
    case 'wiring-unresolvable':
      return {
        label: `${fact.label} (skipped — could not resolve the ${fact.merged ? 'merged' : 'generated'} config)`,
        ok: true,
        skipped: `it would not resolve — "${fact.reason}" — so nothing here proves the emitted rules are `
          + 'alive in it. A package named there that is missing from `package.json` too means '
          + 'init\'s install step never completed; re-run it, or the project\'s own lint, which '
          + 'fails for this same reason. This check runs once that passes',
      };
    case 'wiring-lost':
      return {
        label: fact.label,
        ok: false,
        detail: `${fact.lost.join('; ')} — the resolved config no longer carries the exact text this `
          + 'version emits. Either a later flat-config entry replaced the rule (flat config '
          + 'never merges: combine both option sets into ONE entry — `blueprint rules --json` '
          + 'carries the exact selfOnly selectors), or a hand-folded copy drifted from this '
          + 'version\'s output. The comparison is textual, not semantic: a selector or glob '
          + 'rewritten to an equivalent spelling (`\\/` for `/`, a reordered group) reads as '
          + 'missing here even though eslint would enforce it — copy the emitted text rather '
          + 'than retyping it. Fix that entry, then re-run doctor',
      };

    case 'wiring-survives': {
      const detail = fact.unreadable === 0
        ? undefined
        : `${fact.unreadable} restricted-import/syntax/globals entr${fact.unreadable === 1 ? 'y' : 'ies'} `
          + 'in the resolved config could not be read by this check (not a blueprint entry, or '
          + 'a hand-folded one that drifted) — they are not compared, so a typo in one would '
          + 'not surface here';

      return { label: `${fact.label} (${fact.scope})`, ok: true, detail };
    }
  }
}

function renderSuppressions(
  fact: Extract<DoctorCheckFact, { kind: 'suppressions' }>,
): DoctorCheckView {
  const label = 'lint suppressions ledger current';

  switch (fact.status) {
    case 'unused':
      return { label: `${label} (not in use)`, ok: true };
    case 'valid':
      return { label, ok: true };
    case 'invalid-json':
      return {
        label,
        ok: false,
        detail: `${SUPPRESSIONS_FILE} is not valid JSON — regenerate with: npx eslint . --suppress-all`,
      };
    case 'stale':
      return {
        label,
        ok: false,
        detail: `suppressed files no longer exist (${fact.files.join(', ')}) — run: npx eslint . --prune-suppressions`,
      };
    case 'empty':
      return {
        label,
        ok: true,
        detail: `${SUPPRESSIONS_FILE} is empty — nothing is suppressed, so the file is ceremony; delete it (zero lint debt needs no ledger)`,
      };
  }
}

function renderAlias(fact: Extract<DoctorCheckFact, { kind: 'alias' }>): DoctorCheckView {
  const label = 'import alias wired to the toolchain';

  if (!fact.aliases.length) {
    return { label, ok: true };
  }

  const dir = fact.sourceRoot === '.' ? '.' : `./${fact.sourceRoot}`;

  return {
    label,
    ok: false,
    detail: `${fact.aliases.map((name) => `"${name}"`).join(', ')} resolves nowhere — declare it in `
      + `tsconfig compilerOptions.paths ("${fact.aliases[0]}/*": ["${dir}/*"]) or your bundler's `
      + 'alias config, or the agent contract points at unresolvable imports'
      + (fact.unreadable
        ? ` — but fix ${fact.unreadable} first: this check could not read `
        + 'it, so an alias already declared in there would not have been seen'
        : ''),
  };
}

function renderLeftovers(
  fact: Extract<DoctorCheckFact, { kind: 'leftovers' }>,
): DoctorCheckView {
  const ok = fact.references.length === 0 && fact.authoring.length === 0 && fact.stale.length === 0;

  return {
    label: 'no leftover reference, authoring, or stale contract files',
    ok,
    detail: ok
      ? undefined
      : [
          ...(fact.references.length
            ? [`merge and delete: ${fact.references.join(', ')} — adoption is not done while a reference remains`]
            : []),
          ...(fact.authoring.length
            ? [`${fact.authoring.join(', ')}: authoring artifacts still on disk — the playbook's final step deletes them; a doctor run mid-authoring is EXPECTED to fail here`]
            : []),
          ...(fact.stale.length
            ? [`${fact.stale.join(', ')}: carries the BLUEPRINT block but is not among the emitted targets — a wholly-generated file is removed by the next init; one with hand-written content needs its block removed by hand`]
            : []),
        ].join('; '),
  };
}

function renderLiveLint(
  fact: Extract<DoctorCheckFact, { kind: 'live-lint' }>,
): DoctorCheckView {
  const label = 'reachable eslint leg passes live';

  if (fact.status === 'unreachable') {
    return {
      label: `${label} (skipped — no reachable eslint leg)`,
      ok: true,
      skipped: 'the normal lint entrypoint check above is the red for that',
    };
  }

  if (fact.status === 'unverified') {
    return {
      label: `${label} (skipped — safe execution unavailable)`,
      ok: true,
      skipped: `${fact.command ? `\`${fact.command}\` — ` : ''}${fact.reason}`,
    };
  }

  const detail = `\`${fact.command}\` — ${fact.errors} error(s), ${fact.warnings} warning(s)`;

  return fact.status === 'passed'
    ? { label, ok: true, detail }
    : {
        label,
        ok: false,
        detail: `${detail}; ${fact.reason ?? 'the native ESLint gate failed'}`,
      };
}

export function renderUncommittedDoctorNote(): string {
  return 'Not a version-controlled repo, so nothing adoption wrote is committed — '
    + 'and a ratchet that lives only in an uncommitted working tree is not installed: '
    + 'the next clone starts without it and CI has nothing to run. Initialise version '
    + 'control and commit these files to finish. Doing that is the owner\'s call, never '
    + 'an adopting agent\'s.';
}

export function renderDoctorReport(
  checks: DoctorCheckView[],
  report: { notes?: string[]; json?: boolean },
): string {
  const notes = report.notes ?? [];
  const failed = checks.filter((check) => !check.ok).length;
  const skipped = checks.filter((check) => check.skipped).length;
  const passed = checks.length - failed - skipped;
  const verdict = failed ? 'incomplete' : skipped ? 'unverified' : 'complete';

  const banner = failed === 0 && !skipped
    ? `✓ Adoption complete — all ${checks.length} checks passed.`
    : failed === 0
      ? `⊘ Adoption unverified — ${passed} of ${checks.length} checks passed, `
      + `${skipped} could not run (⊘ above). Nothing failed, and nothing here `
      + 'proves what those checks cover.'
      : `✗ Adoption incomplete — ${failed} of ${checks.length} check(s) failed`
        + `${skipped ? `, and ${skipped} could not run (⊘ above) — fixing the ✗ leaves those still unproven` : ''}.`;

  if (report.json) {
    return JSON.stringify({
      ok: checks.every((check) => check.ok),
      verdict,
      summary: banner,
      counts: { total: checks.length, passed, failed, skipped },
      checks,
      note: notes.length ? notes.join('\n') : undefined,
    }, null, 2);
  }

  return [
    'blueprint doctor',
    ...checks.map((check) => {
      const mark = check.ok ? (check.skipped ? '⊘' : '✓') : '✗';
      const under = check.skipped ?? check.detail;

      return `  ${mark} ${check.label}${under ? `\n      ${under}` : ''}`;
    }),
    '',
    banner,
    ...notes.map((note) => `  ${note}`),
  ].join('\n');
}
