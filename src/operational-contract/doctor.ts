import {
  renderDivergentReadingClause,
  renderOutOfScanReachClause,
  renderOwnersCallClause,
} from './lint';
import type { GlobReachFact } from './lint';
import { CURRENT_CONFIG_ADOPTION_SCOPE } from './inspect';
import { renderObligationFailure } from './transformation';
import type { TransformationObligationFailure } from './transformation';

type AliasConsumerEvidence = {
  consumer: 'typescript' | 'bundler-runtime' | 'package-subpath' | 'test-runner';
  status: 'verified' | 'missing' | 'absent' | 'not-applicable' | 'unverified';
  aliases: string[];
  files: string[];
  unreadable?: string[];
};

export interface DoctorCheckView {
  label: string;
  ok: boolean;
  detail?: string;
  skipped?: string;
  consumer?: AliasConsumerEvidence['consumer'];
  status?: AliasConsumerEvidence['status'];
  aliases?: string[];
  files?: string[];
}

export type DoctorCheckFact
  = | { kind: 'config'; present: boolean }
    | { kind: 'suppressions'; status: 'unused' | 'valid' }
    | { kind: 'suppressions'; status: 'invalid-json' }
    | { kind: 'suppressions'; status: 'stale'; files: string[] }
    | { kind: 'suppressions'; status: 'empty' }
    | { kind: 'alias-consumer'; evidence: AliasConsumerEvidence; sourceRoot: string }
    | { kind: 'leftovers'; references: string[]; authoring: string[]; stale: string[] }
    | { kind: 'transformation'; status: 'invalid'; detail: string }
    | {
      kind: 'transformation';
      status: 'pending';
      verified: boolean;
      failures: TransformationObligationFailure[];
    }
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
      importAnalysis: import('./inspect').ImportGraphFact;
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
  kind: 'config' | 'suppressions' | 'leftovers' | 'transformation' | 'eslint-wired'
    | 'lint-entrypoint';
}>;
type RuntimeCheckFact = Extract<DoctorCheckFact, { kind: 'live-lint' | 'architecture' }>;
type WiringCheckFact = Extract<DoctorCheckFact, { kind: `wiring-${string}` }>;
type TransformationCheckFact = Extract<DoctorCheckFact, { kind: 'transformation' }>;

const SUPPRESSIONS_FILE = 'eslint-suppressions.json';

export function renderDoctorCheck(fact: DoctorCheckFact): DoctorCheckView {
  if (fact.kind === 'alias-consumer') {
    return renderAliasConsumer(fact);
  }

  if (['config', 'suppressions', 'leftovers', 'transformation', 'eslint-wired', 'lint-entrypoint']
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
    case 'leftovers':
      return renderLeftovers(fact);
    case 'transformation':
      return renderTransformation(fact);
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
      return renderLintEntrypoint(fact);
  }
}

function renderLintEntrypoint(
  fact: Extract<DoctorCheckFact, { kind: 'lint-entrypoint' }>,
): DoctorCheckView {
  const label = 'normal lint entrypoint reaches eslint';

  if (fact.reachable) {
    return { label, ok: true, detail: undefined };
  }

  if (fact.reason === 'missing-lint') {
    return { label, ok: true,
      skipped: 'No recognised lint or eslint script; the normal lint entrypoint '
        + 'could not be determined. Expose it through a lint script to verify this check.' };
  }

  return { label, ok: false,
    detail: `package.json lint entrypoint runs \`${fact.entrypoint}\`, but no reachable delegated `
      + 'script runs eslint — wire eslint into lint or an ordinary npm/pnpm/yarn script it calls' };
}

function renderTransformation(fact: TransformationCheckFact): DoctorCheckView {
  let detail: string;

  if (fact.status === 'invalid') {
    detail = fact.detail;
  } else if (fact.verified) {
    detail = 'the final state verifies; run `blueprint init --topology module-first` to retire '
      + 'the obligation';
  } else {
    detail = `LF→MF transformation incomplete: ${fact.failures
      .map(renderObligationFailure).join('; ')}`;
  }

  return { label: 'topology transformation verified and retired', ok: false, detail };
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
  let detail = `${fact.coverage}; import analysis ${fact.importAnalysis.status} `
    + `(${fact.importAnalysis.parsedFiles}/${fact.importAnalysis.scannedFiles} scanned files parsed)`;

  if (fact.hasErrors) {
    detail = fact.suppressed > 0
      ? `${fact.fresh} finding(s) outside the baseline — fix, or \`blueprint inspect --update-baseline\``
      : `${fact.fresh} finding(s) — fix, or lock as accepted debt: \`blueprint inspect --update-baseline\``;
  } else if (fact.vacuous) {
    detail = `clean, but vacuous — architecture globs match 0 of ${fact.vacuous.sourceFiles} source file(s); the wiring is done — ${fact.vacuous.nextStep}`;
  }

  const importHealthy = fact.importAnalysis.status === 'healthy';

  return {
    label: importHealthy
      ? fact.suppressed > 0
        ? 'architecture clean (findings covered by the baseline)'
        : 'architecture clean'
      : `architecture nets clean; import analysis ${fact.importAnalysis.status}`,
    ok: !fact.hasErrors && importHealthy,
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

function renderAliasConsumer(
  fact: Extract<DoctorCheckFact, { kind: 'alias-consumer' }>,
): DoctorCheckView {
  const { evidence } = fact;
  const names = evidence.aliases.map((name) => `"${name}"`).join(', ');
  const label = `import alias · ${evidence.consumer}`;

  const structural = {
    consumer: evidence.consumer,
    status: evidence.status,
    aliases: evidence.aliases,
    files: evidence.files,
  };

  if (evidence.status === 'verified') {
    return { label, ok: true, ...structural };
  }

  if (evidence.status === 'missing') {
    const dir = fact.sourceRoot === '.' ? '.' : `./${fact.sourceRoot}`;

    const remedy = evidence.consumer === 'typescript'
      ? `declare compilerOptions.paths ("${evidence.aliases[0]}/*": ["${dir}/*"])`
      : `declare ${names} in the recognised ${evidence.consumer} configuration`;

    return { label, ok: false, detail: `${names} is missing — ${remedy}`, ...structural };
  }

  const reason = evidence.status === 'not-applicable'
    ? 'the configured aliases are not package # subpaths'
    : evidence.status === 'absent'
      ? `no recognised ${evidence.consumer} configuration is present`
      : `${evidence.unreadable?.join(', ') ?? 'the configuration'} could not be read statically`;

  return evidence.status === 'unverified'
    ? { label, ok: true, skipped: reason, ...structural }
    : { label, ok: true, detail: reason, ...structural };
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
      skipped: 'see the normal lint entrypoint check above for the missing or unverified path',
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

export { renderDoctorReport } from './doctor-report';
export { CURRENT_CONFIG_ADOPTION_SCOPE };
