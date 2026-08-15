import fs from 'node:fs';
import path from 'node:path';

import { defaultAgentPaths, emitAgentFiles } from '../emit/agent';
import {
  AUTHORING_FILE,
  COMMAND_FILE,
  describeUnreadable,
  detect,
  loadProjectModule,
  pathAliasKeys,
  quotedIn,
  resolveBlueprint,
  unreadableTsconfigs,
} from '../project';
import type { ProjectState, ResolveOptions } from '../project';
import type { Blueprint } from '../config';
import { analyze } from './analyze';
import { BASELINE_FILE, parseBaseline, splitByBaseline } from './baseline';
import { computeCoverage, coverageSummary, vacuousNextStep } from './coverage';
import { hasErrors } from './report';
import { scan } from './scan';
import type { DoctorCheck } from './types';
import { wiringCheck } from './wiring';

// Deliberately NOT extending ResolveOptions: doctor fails loud without a
// config, and `framework` only steers the no-config preset fallback — a
// `--framework` here would be an inert flag that lies to whoever reads it.
export interface DoctorOptions {
  /** Emit machine-readable JSON instead of the checklist. */
  json?: boolean;
  /** Output sink (default `console.log`). */
  log?: (message: string) => void;
  /** Load a module from the project's dependency tree (default: real import). */
  loadModule?: (name: string, root: string) => Promise<unknown>;
  /** Load an existing blueprint.config (default dynamic import). */
  loadConfig?: ResolveOptions['loadConfig'];
}

export type { DoctorCheck } from './types';

/**
 * What the run established. `complete`: every check passed. `unverified`: none failed
 * and at least one could not run. `incomplete`: something failed.
 */
export type DoctorVerdict = 'complete' | 'unverified' | 'incomplete';

const SUPPRESSIONS_FILE = 'eslint-suppressions.json';

/**
 * The lint side of the debt ledger. Doctor cannot re-run eslint, but it catches the
 * cheap drift: suppressed entries whose file is gone, or an unreadable ledger. An
 * absent file means the ledger is not in use, which is fine.
 */
function suppressionsCheck(root: string): DoctorCheck {
  const label = 'lint suppressions ledger current';
  const file = path.join(root, SUPPRESSIONS_FILE);

  if (!fs.existsSync(file)) {
    return { label: `${label} (not in use)`, ok: true };
  }

  let entries: Record<string, unknown>;

  try {
    entries = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {
      label,
      ok: false,
      detail: `${SUPPRESSIONS_FILE} is not valid JSON — regenerate with: npx eslint . --suppress-all`,
    };
  }

  const stale = Object.keys(entries).filter((entry) => !fs.existsSync(path.join(root, entry)));

  if (stale.length) {
    return {
      label,
      ok: false,
      detail: `suppressed files no longer exist (${stale.join(', ')}) — run: npx eslint . --prune-suppressions`,
    };
  }

  // Zero-debt doctrine, lint side: running --suppress-all on a clean lint
  // writes an EMPTY ledger — ceremony, and asymmetric with the baseline
  // (which writes no file on zero debt). Green, but say what to do.
  if (!Object.keys(entries).length) {
    return {
      label,
      ok: true,
      detail: `${SUPPRESSIONS_FILE} is empty — nothing is suppressed, so the file is ceremony; delete it (zero lint debt needs no ledger)`,
    };
  }

  return { label, ok: true };
}

/**
 * Bundler configs the alias check scans beyond the vite config `detect` reads. A
 * check blind to where the alias is actually wired is a forever-red gate.
 */
const BUNDLER_FILES = ['webpack.config', 'vue.config', 'next.config', 'rsbuild.config']
  .flatMap((name) => ['js', 'cjs', 'mjs', 'ts'].map((ext) => `${name}.${ext}`));

/**
 * A declared-yet-unwired alias is the inverse trap to a wrong default: the contract
 * tells agents to import through a prefix no toolchain resolves. Wired = it appears
 * in tsconfig/jsconfig `paths`, or in a bundler config as a quoted token.
 */
function aliasCheck(root: string, blueprint: Blueprint, state: ProjectState): DoctorCheck {
  const { alias, additionalAliases, sourceRoot } = blueprint.architecture;
  const declared = pathAliasKeys(state.tsconfigs);

  // Built without holes rather than filtered afterwards: the filter was a compiler
  // narrowing and undecidable at runtime. Both guards below decide something —
  // `readFileSync` throws on a missing file, and dropping the vite arm makes an
  // alias wired only in vite.config.ts read as wired nowhere.
  const bundlerTexts = BUNDLER_FILES.map((file) => path.join(root, file))
    .filter((full) => fs.existsSync(full))
    .map((full) => fs.readFileSync(full, 'utf-8'));

  if (state.viteConfig) {
    bundlerTexts.push(state.viteConfig.text);
  }

  const unwired = [alias, ...Object.keys(additionalAliases ?? {})].filter(
    (name) => !declared.has(name) && !bundlerTexts.some((text) => quotedIn(text, name)),
  );

  if (!unwired.length) {
    return { label: 'import alias wired to the toolchain', ok: true };
  }

  const dir = sourceRoot === '.' ? '.' : `./${sourceRoot ?? 'src'}`;

  // A tsconfig that is present but unparseable makes every alias inside it
  // invisible to the check above, so "resolves nowhere" would be the reader's
  // second problem and not their first. Naming the file first stops the remedy
  // from misdirecting: the alias may already be declared in there.
  const unreadable = unreadableTsconfigs(state.tsconfigs);

  return {
    label: 'import alias wired to the toolchain',
    ok: false,
    detail: `${unwired.map((name) => `"${name}"`).join(', ')} resolves nowhere — declare it in `
      + `tsconfig compilerOptions.paths ("${unwired[0]}/*": ["${dir}/*"]) or your bundler's `
      + 'alias config, or the agent contract points at unresolvable imports'
      + (unreadable.length
        ? ` — but fix ${describeUnreadable(unreadable)} first: this check could not read `
        + 'it, so an alias already declared in there would not have been seen'
        : ''),
  };
}

/**
 * Reference files are named `<name>.blueprint.<ext>` — never the config itself.
 *
 * The `.sort()` is undecidable: `readdirSync` already answers in name order on the
 * volumes a test can run on, so the guarantee it provides elsewhere is unobservable
 * here. `DoctorOptions` is public API, so an injected reader would be adopter-facing
 * surface for a test concern — this keeps the sort instead.
 */
function referenceFiles(root: string): string[] {
  return fs
    .readdirSync(root)
    .filter((name) => name.includes('.blueprint.'))
    .sort();
}

/**
 * Contract files outside the declared emit set. One carrying hand-written content
 * only gets an instruct, so without this check the orphan lives on with every gate
 * green (field issues #2/#3).
 */
function staleContracts(root: string, blueprint: Blueprint): string[] {
  const emitted = new Set(emitAgentFiles(blueprint).map((file) => file.path));

  return defaultAgentPaths()
    .filter((spec) => !emitted.has(spec.path))
    .filter((spec) => {
      const full = path.join(root, spec.path);

      if (!fs.existsSync(full)) {
        return false;
      }

      // Own-strategy rule files are wholly generated by construction; a
      // merge file counts only when it carries the managed marker block.
      return (
        spec.strategy === 'own'
        || fs.readFileSync(full, 'utf-8').includes('<!-- BLUEPRINT:START -->')
      );
    })
    .map((spec) => spec.path)
    .sort();
}

/**
 * Run `blueprint doctor` in `root`. Read-only. Answers the one question the
 * adoption prompt's acceptance clause asks — "is adoption actually finished?"
 * — as a checklist: config present, no leftover reference files, eslint wired
 * to emitLint, the declared alias wired to the toolchain, the emitted rules
 * still alive in the merged eslint config, and the architecture clean under
 * the baseline (its detail states the coverage, so a vacuous green is
 * visible). Exit 0 iff every check passes, so you can gate on it — a git
 * hook, CI, an agent's verify loop.
 *
 * `ok` is "nothing failed", which the exit code follows. It is NOT "everything was
 * verified": a check that could not run rides on `ok: true` deliberately, so read
 * `verdict` when the difference matters — the JSON said `"ok": true` while the text
 * said `⊘ Adoption unverified` about the same run, and that gap nearly became a
 * green CI gate (field run #141).
 * @group Runtimes
 * @example
 * const { ok, verdict } = await runDoctor(process.cwd());
 *
 * process.exitCode = ok ? 0 : 1;
 *
 * if (verdict === 'unverified') console.warn('a check could not run');
 */
export async function runDoctor(
  root: string,
  options: DoctorOptions = {},
): Promise<{ ok: boolean; verdict: DoctorVerdict; checks: DoctorCheck[] }> {
  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);

  // No config = nothing to check; every other check assumes one exists.
  if (!state.hasConfig) {
    const checks: DoctorCheck[] = [
      {
        label: 'blueprint.config.mjs present',
        ok: false,
        detail: 'run `blueprint init` (or `init --authoring` on an existing repo) first',
      },
    ];

    // No note on this path: adoption has not started, so "commit what it wrote" is
    // not the next step — running init is.
    emit(log, checks, undefined, options.json);

    return { ok: false, verdict: verdictOf(checks), checks };
  }

  const references = referenceFiles(root);

  const authoring = [AUTHORING_FILE, COMMAND_FILE].filter((file) =>
    fs.existsSync(path.join(root, file)));

  const eslintWired = state.ownedEslintConfig !== undefined || state.wiredEslintConfig;

  const { blueprint } = await resolveBlueprint(root, state, options);
  const stale = staleContracts(root, blueprint);
  const scanResult = scan(root, blueprint.architecture.sourceRoot);
  // Same state, same analysis: `analyze` returning different findings for one repo
  // depending on which runtime asked would be its own defect. Nothing in doctor's
  // output reads an info finding — the architecture check reports counts only when
  // there are errors, and `ok` is errors-only — so this changes no verdict.
  const findings = analyze(scanResult, blueprint, state.dependencies);
  const coverage = computeCoverage(scanResult, blueprint, state.hasTypescript);

  // Undecidable: this list exists to be matched against findings, so a bogus entry
  // put in the empty arm's place matches nothing and reads exactly like no baseline.
  // Nothing here counts entries it failed to match — the lint ledger's stale check is
  // the symmetric thing this side does not have.
  const recorded = fs.existsSync(path.join(root, BASELINE_FILE))
    ? parseBaseline(fs.readFileSync(path.join(root, BASELINE_FILE), 'utf-8'))
    : [];

  const { fresh, suppressed } = splitByBaseline(findings, recorded);

  const wiring = await wiringCheck({
    root,
    blueprint,
    scanResult,
    wired: eslintWired,
    // `ownedEslintConfig` is init's own generated file — nothing was merged into it,
    // so the check must not call it a merge. `wiredEslintConfig` is the other arm of
    // `eslintWired` above: a hand-maintained config its owner wired the package into.
    merged: state.ownedEslintConfig === undefined,
    hasTypescript: state.hasTypescript,
    load: options.loadModule ?? loadProjectModule,
  });

  const checks: DoctorCheck[] = [
    { label: 'blueprint.config.mjs present', ok: true },
    {
      label: 'no leftover reference, authoring, or stale contract files',
      ok: references.length === 0 && stale.length === 0 && authoring.length === 0,
      detail: references.length || stale.length || authoring.length
        ? [
            ...(references.length
              ? [`merge and delete: ${references.join(', ')} — adoption is not done while a reference remains`]
              : []),
            // The playbook defines "done" as including its own cleanup —
            // doctor saying "complete" over a live playbook told a second,
            // contradicting story (field issue #13).
            ...(authoring.length
              ? [`${authoring.join(', ')}: authoring artifacts still on disk — the playbook's final step deletes them; a doctor run mid-authoring is EXPECTED to fail here`]
              : []),
            ...(stale.length
              ? [`${stale.join(', ')}: carries the BLUEPRINT block but is not among the emitted targets — a wholly-generated file is removed by the next init; one with hand-written content needs its block removed by hand`]
              : []),
          ].join('; ')
        : undefined,
    },
    {
      label: 'eslint wired to emitLint',
      ok: eslintWired,
      detail: eslintWired
        ? undefined
        : state.eslintConfigShape === 'legacy'
          ? `${state.legacyEslintConfig} is legacy — migrate to flat config, then spread ...emitLint(blueprint)`
          : 'spread ...emitLint(blueprint) into your '
            + 'eslint config (see eslint.config.blueprint.mjs)',
    },
    aliasCheck(root, blueprint, state),
    wiring,
    {
      // The check judges net of the baseline, but the label only mentions
      // the ledger while it is actually covering something — inspect says
      // "no baseline needed" on a truly clean repo, and doctor claiming
      // coverage by a ledger that does not exist told the opposite story
      // about the same state (field run #10).
      label: suppressed > 0
        ? 'architecture clean (findings covered by the baseline)'
        : 'architecture clean',
      ok: !hasErrors(fresh),
      // The green states its reach — a clean report over an empty net is
      // vacuous, and the reader deserves to see which one they got.
      detail: hasErrors(fresh)
        ? suppressed > 0
          ? `${fresh.length} finding(s) outside the baseline — fix, or \`blueprint inspect --update-baseline\``
          : `${fresh.length} finding(s) — fix, or lock as accepted debt: \`blueprint inspect --update-baseline\``
        : coverage.sourceFiles > 0 && coverage.layerFiles === 0
          ? `clean, but vacuous — layer globs match 0 of ${coverage.sourceFiles} source file(s); the wiring is done — ${vacuousNextStep(blueprint)}`
          : coverageSummary(coverage),
    },
    suppressionsCheck(root),
  ];

  const ok = checks.every((check) => check.ok);

  emit(log, checks, uncommittedNote(root), options.json);

  return { ok, verdict: verdictOf(checks), checks };
}

/**
 * What "complete" leaves out on a repo with no version control: every check can
 * pass while nothing adoption wrote is committed, and doctor is the last thing on
 * screen. Three field agents closed on that gap in their own words.
 *
 * The no-VCS case only — a git repo's own working tree needs `git status`, and
 * doctor is read-only with zero dependencies.
 */
function uncommittedNote(root: string): string | undefined {
  if (fs.existsSync(path.join(root, '.git'))) {
    return undefined;
  }

  return 'Not a version-controlled repo, so nothing adoption wrote is committed — '
    + 'and a ratchet that lives only in an uncommitted working tree is not installed: '
    + 'the next clone starts without it and CI has nothing to run. Initialise version '
    + 'control and commit these files to finish. Doing that is the owner\'s call, never '
    + 'an adopting agent\'s.';
}

/**
 * The banner's three states as one value — the field automation should gate on.
 * `ok` stays what it always meant (nothing FAILED, and the exit code follows it);
 * this says whether anything was left unproven.
 */
function verdictOf(checks: DoctorCheck[]): DoctorVerdict {
  if (checks.some((check) => !check.ok)) {
    return 'incomplete';
  }

  return checks.some((check) => check.skipped) ? 'unverified' : 'complete';
}

/**
 * The banner sentence and the counts behind it — one passage, both channels, so a
 * machine reading `ok` learns what a reader is told (field run #149).
 *
 * `ok` is not flipped for a skip: it means nothing FAILED, which is what the exit
 * code means, so a consumer following it would start failing on a state nobody can
 * appease. A skip is still not a pass, and folding it into "all N checks passed" is
 * what let an agent report the lint wiring as verified (#129).
 */
function summarize(checks: DoctorCheck[]): {
  verdict: DoctorVerdict;
  passed: number;
  failed: number;
  skipped: number;
  banner: string;
} {
  const failed = checks.filter((check) => !check.ok).length;
  const skipped = checks.filter((check) => check.skipped).length;
  const passed = checks.length - failed - skipped;

  const banner = failed === 0 && !skipped
    ? `✓ Adoption complete — all ${checks.length} checks passed.`
    : failed === 0
      ? `⊘ Adoption unverified — ${passed} of ${checks.length} checks passed, `
      + `${skipped} could not run (⊘ above). Nothing failed, and nothing here `
      + 'proves what those checks cover.'
      // A skip riding under a failure was invisible — the red arm counted only
      // failures, so fixing them left the reader at a green never flagged as partly
      // unproven (#129: an agent reads the banner and stops).
      : `✗ Adoption incomplete — ${failed} of ${checks.length} check(s) failed`
        + `${skipped ? `, and ${skipped} could not run (⊘ above) — fixing the ✗ leaves those still unproven` : ''}.`;

  return { verdict: verdictOf(checks), passed, failed, skipped, banner };
}

function emit(
  log: (m: string) => void,
  checks: DoctorCheck[],
  note: string | undefined,
  json?: boolean,
): void {
  const { verdict, passed, failed, skipped, banner } = summarize(checks);

  if (json) {
    // Both channels or they disagree about the same run, which is its own defect:
    // automation reading JSON must not learn less than a reader. `verdict` sits
    // beside `ok` because `ok` cannot carry three states and a skip rides on
    // `ok: true`; `summary` and `counts` follow because an enum is a word where the
    // text had a sentence and a ratio (field run #141).
    log(JSON.stringify(
      {
        ok: checks.every((check) => check.ok),
        verdict,
        summary: banner,
        counts: { total: checks.length, passed, failed, skipped },
        checks,
        note,
      },
      null,
      2,
    ));

    return;
  }

  log(
    [
      'blueprint doctor',
      ...checks.map((check) => {
        const mark = check.ok ? (check.skipped ? '⊘' : '✓') : '✗';
        const under = check.skipped ?? check.detail;

        return `  ${mark} ${check.label}${under ? `\n      ${under}` : ''}`;
      }),
      '',
      banner,
      // Under the banner rather than as an eighth check: it cannot fail (init never
      // takes version control into its own hands), and a check that is always green
      // would push the count every conformance fixture states.
      ...(note ? [`  ${note}`] : []),
    ].join('\n'),
  );
}
