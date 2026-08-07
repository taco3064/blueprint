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
 * The lint side of the debt ledger (ESLint ≥ 9.24 bulk suppressions). Doctor
 * cannot re-run eslint (read-only, zero deps), but it CAN catch the cheap
 * drift: suppressed entries whose file no longer exists, or an unreadable
 * ledger. Absent file = the ledger is simply not in use — fine.
 */
function suppressionsCheck(root: string): DoctorCheck {
  const label = 'lint suppressions ledger current';
  const file = path.join(root, SUPPRESSIONS_FILE);

  if (!fs.existsSync(file)) return { label: `${label} (not in use)`, ok: true };

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
 * Bundler configs the alias check scans beyond the vite config `detect`
 * already reads — the webpack-era and current homes of a resolve alias. A
 * check that cannot see where the alias is actually wired would be a forever-
 * red gate with no way to appease it.
 */
const BUNDLER_FILES = ['webpack.config', 'vue.config', 'next.config', 'rsbuild.config']
  .flatMap((name) => ['js', 'cjs', 'mjs', 'ts'].map((ext) => `${name}.${ext}`));

/**
 * The alias is required in the config precisely because a wrong default would
 * silently pass illegal imports — but a *declared-yet-unwired* alias is the
 * inverse trap: the contract tells agents to import through a prefix no
 * toolchain resolves. Wired = the alias appears in tsconfig/jsconfig `paths`
 * (any target), or a bundler config's text carries it as a quoted token
 * (`quotedIn` — the standard init's alias instructs share).
 */
function aliasCheck(root: string, blueprint: Blueprint, state: ProjectState): DoctorCheck {
  const { alias, additionalAliases, sourceRoot } = blueprint.architecture;
  const declared = pathAliasKeys(state.tsconfigs);

  // Built without holes rather than built with holes and filtered. The filter that
  // used to close this was `(text): text is string => text !== undefined` — a
  // narrowing for the compiler, and undecidable at runtime, because `quotedIn`
  // regex-tests its argument and `test(undefined)` searches the string "undefined"
  // for the alias. Both guards below decide something: read a file that is not
  // there and `readFileSync` throws; drop the vite arm and an alias wired only in
  // vite.config.ts reads as wired nowhere.
  const bundlerTexts = BUNDLER_FILES.map((file) => path.join(root, file))
    .filter((full) => fs.existsSync(full))
    .map((full) => fs.readFileSync(full, 'utf-8'));

  if (state.viteConfig) bundlerTexts.push(state.viteConfig.text);

  const unwired = [alias, ...Object.keys(additionalAliases ?? {})].filter(
    (name) => !declared.has(name) && !bundlerTexts.some((text) => quotedIn(text, name)),
  );

  if (!unwired.length) return { label: 'import alias wired to the toolchain', ok: true };

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
 * The `.sort()` is undecidable here: `readdirSync` already answers in name order on
 * macOS and on a small ext4 directory, so the guarantee that matters on other volumes
 * cannot be seen where it is cheapest to run. `scan` solves the same problem with an
 * injected reader — `DoctorOptions` is public API, and a reader option there would be
 * adopter-facing surface for a test concern, so this one keeps the sort and the note.
 */
function referenceFiles(root: string): string[] {
  return fs
    .readdirSync(root)
    .filter((name) => name.includes('.blueprint.'))
    .sort();
}

/**
 * Contract files outside the declared emit set. Init removes a wholly-
 * generated one on its next run, but one carrying hand-written content only
 * gets an instruct — and without this check, that orphan lives on with every
 * gate green (field issue #2/#3: a narrowed emit.agents left AGENTS.md
 * behind and nothing ever said so again).
 */
function staleContracts(root: string, blueprint: Blueprint): string[] {
  const emitted = new Set(emitAgentFiles(blueprint).map((file) => file.path));

  return defaultAgentPaths()
    .filter((spec) => !emitted.has(spec.path))
    .filter((spec) => {
      const full = path.join(root, spec.path);

      if (!fs.existsSync(full)) return false;

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
  const findings = analyze(scanResult, blueprint);
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
          : 'spread ...emitLint(blueprint) into your eslint config (see eslint.config.blueprint.mjs)',
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
 * What "complete" leaves out on a repo with no version control.
 *
 * Every check can pass while nothing adoption wrote is committed, and the two
 * truths do not meet anywhere the reader can see them: the authoring playbook says
 * a ratchet living only in an uncommitted working tree is not installed, and then
 * doctor — the last thing on screen, and often the only thing still in an agent's
 * context — prints "Adoption complete". Three field agents closed on exactly that
 * gap in their own words ("what I reported as complete is complete minus commit").
 *
 * Only the no-VCS case, and deliberately: whether a git repo's own working tree is
 * clean needs `git status`, and doctor is read-only with zero dependencies. The
 * absence of `.git` is a fact one `existsSync` settles.
 */
function uncommittedNote(root: string): string | undefined {
  if (fs.existsSync(path.join(root, '.git'))) return undefined;

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
  if (checks.some((check) => !check.ok)) return 'incomplete';

  return checks.some((check) => check.skipped) ? 'unverified' : 'complete';
}

/**
 * The banner sentence and the counts behind it — one passage, both channels.
 *
 * It used to live inside the text branch, so the JSON carried `ok` and `verdict`
 * and not this: only a reader was told "6 of 7 passed, 1 could not run". A machine
 * that read `ok` and stopped saw a plain green, and an agent said so — the field's
 * suggested remedies were `ok: false` or an explicit skipped aggregate (field run
 * #149). The aggregate is the right half. Flipping `ok` is not: `ok` means nothing
 * FAILED, which is exactly what this command's exit code means, so a consumer
 * following it would start failing on a skip — and a skip is deliberately not a
 * failure, because the state that produces one (an eslint config that will not
 * resolve on a machine with no registry) is a red nobody can appease.
 *
 * A skip is still not a pass. It rides on `ok: true` so nothing goes red that
 * cannot be appeased, and the banner used to fold it into "all N checks passed" —
 * the exact reading that let an agent report the lint wiring as verified (#129).
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
      // A skip riding along under a failure was invisible: the red arm counted only
      // failures, so `2 of 7 failed` was the whole banner while the JSON said
      // `skipped: 1`. #129's lesson is that an agent reads the banner and stops — and
      // fixing the failures would then leave it at a green it had never been told was
      // partly unproven.
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
    // The note rides on both channels or the two disagree about the same run, which
    // is its own defect — automation reading JSON must not learn less than a reader.
    // `verdict` beside `ok`, because `ok` cannot carry three states and a skip rides
    // on `ok: true` by design (exit 0 follows it). So the JSON said `"ok": true` while
    // the text said `⊘ Adoption unverified` about the same run, and an agent nearly
    // took it as a CI-usable green before cross-checking with the plain output and its
    // own lint (field run #141). `verdict` closed that; `summary` and `counts` close
    // what #141's fix left — the enum was a word where the text had a sentence and a
    // ratio, so a reader of the JSON still learned less than a reader of the screen.
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
