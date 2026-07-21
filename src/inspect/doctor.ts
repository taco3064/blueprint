import fs from 'node:fs';
import path from 'node:path';

import { detect, resolveBlueprint } from '../project';
import type { ResolveOptions } from '../project';
import { analyze } from './analyze';
import { BASELINE_FILE, parseBaseline, splitByBaseline } from './baseline';
import { hasErrors } from './report';
import { scan } from './scan';

export interface DoctorOptions extends ResolveOptions {
  /** Emit machine-readable JSON instead of the checklist. */
  json?: boolean;
  /** Output sink (default `console.log`). */
  log?: (message: string) => void;
}

/** One adoption-completeness check — the unit of the doctor report. */
export interface DoctorCheck {
  label: string;
  ok: boolean;
  /** What to do about it, when the check failed. */
  detail?: string;
}

/** Reference files are named `<name>.blueprint.<ext>` — never the config itself. */
function referenceFiles(root: string): string[] {
  return fs
    .readdirSync(root)
    .filter((name) => name.includes('.blueprint.'))
    .sort();
}

/**
 * Run `blueprint doctor` in `root`. Read-only. Answers the one question the
 * adoption prompt's acceptance clause asks — "is adoption actually finished?"
 * — as a checklist: config present, no leftover reference files, eslint wired
 * to emitLint, and the architecture clean under the baseline. Exit 0 iff every
 * check passes, so it drops into CI or an agent's verify loop.
 * @group Runtimes
 * @example
 * const { ok } = await runDoctor(process.cwd());
 *
 * process.exitCode = ok ? 0 : 1;
 */
export async function runDoctor(
  root: string,
  options: DoctorOptions = {},
): Promise<{ ok: boolean; checks: DoctorCheck[] }> {
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

    emit(log, checks, options.json);

    return { ok: false, checks };
  }

  const references = referenceFiles(root);
  const eslintWired = state.ownedEslintConfig !== undefined || state.wiredEslintConfig;

  const { blueprint } = await resolveBlueprint(root, state, options);
  const findings = analyze(scan(root, blueprint.architecture.sourceRoot), blueprint);

  const recorded = fs.existsSync(path.join(root, BASELINE_FILE))
    ? parseBaseline(fs.readFileSync(path.join(root, BASELINE_FILE), 'utf-8'))
    : [];

  const fresh = splitByBaseline(findings, recorded).fresh;

  const checks: DoctorCheck[] = [
    { label: 'blueprint.config.mjs present', ok: true },
    {
      label: 'no leftover reference files',
      ok: references.length === 0,
      detail: references.length
        ? `merge and delete: ${references.join(', ')} — adoption is not done while a reference remains`
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
    {
      label: 'architecture clean (findings covered by the baseline)',
      ok: !hasErrors(fresh),
      detail: hasErrors(fresh)
        ? `${fresh.length} finding(s) outside the baseline — fix, or \`blueprint inspect --update-baseline\``
        : undefined,
    },
  ];

  const ok = checks.every((check) => check.ok);

  emit(log, checks, options.json);

  return { ok, checks };
}

function emit(log: (m: string) => void, checks: DoctorCheck[], json?: boolean): void {
  if (json) {
    log(JSON.stringify({ ok: checks.every((check) => check.ok), checks }, null, 2));

    return;
  }

  const failed = checks.filter((check) => !check.ok).length;

  log(
    [
      'blueprint doctor',
      ...checks.map(
        (check) =>
          `  ${check.ok ? '✓' : '✗'} ${check.label}${check.detail ? `\n      ${check.detail}` : ''}`,
      ),
      '',
      failed === 0
        ? `✓ Adoption complete — all ${checks.length} checks passed.`
        : `✗ Adoption incomplete — ${failed} of ${checks.length} check(s) failed.`,
    ].join('\n'),
  );
}
