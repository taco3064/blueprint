#!/usr/bin/env node
import fs, { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runInit } from '../bootstrap';
import { runImpact } from '../impact';
import { runDeps, runDoctor, runInspect, runRules } from '../inspect';
import { runSurvey } from '../survey';
import {
  KNOWN_FLAGS,
  parseDepsArgs,
  parseDoctorArgs,
  parseImpactArgs,
  parseInitArgs,
  parseInspectArgs,
  parseRulesArgs,
  parseSurveyArgs,
  rejectUnknownFlags,
} from './args';
import { COMMAND_HELP, USAGE } from './help';

/**
 * The package version, read at runtime. The bundled bin lives at
 * `dist/bin.js` (package.json one level up); the source module lives at
 * `src/cli/cli.ts` (two levels up) — the walk covers both layouts.
 */
export function version(dir: string = path.dirname(fileURLToPath(import.meta.url))): string {
  for (const relative of ['../package.json', '../../package.json']) {
    const file = path.join(dir, relative);

    if (fs.existsSync(file)) {
      return (JSON.parse(fs.readFileSync(file, 'utf-8')) as { version: string }).version;
    }
  }

  return 'unknown';
}

/** CLI dispatch. Returns the process exit code. */
export async function run(argv: string[], cwd: string = process.cwd()): Promise<number> {
  const [command, ...rest] = argv;

  if (command === '--help' || command === '-h') {
    console.log(USAGE);

    return 0;
  }

  if (command === '--version' || command === '-v') {
    console.log(version());

    return 0;
  }

  // `Object.hasOwn` over `in`: `hasOwn(record, '')` is false, which is the answer
  // wanted for "no command given", and it does not walk the prototype chain.
  const help = COMMAND_HELP[command ?? ''];

  if (help !== undefined && (rest.includes('--help') || rest.includes('-h'))) {
    console.log(help);

    return 0;
  }

  try {
    const known = KNOWN_FLAGS[command ?? ''];

    if (known !== undefined) {
      rejectUnknownFlags(known, command as string, rest);
    }

    if (command === 'init') {
      await runInit(cwd, parseInitArgs(rest));

      return 0;
    }

    if (command === 'survey') {
      runSurvey(cwd, parseSurveyArgs(rest));

      return 0;
    }

    if (command === 'inspect') {
      const { ok } = await runInspect(cwd, parseInspectArgs(rest));

      return ok ? 0 : 1;
    }

    if (command === 'impact') {
      // Informational dry-run — any hit count is a valid answer, so exit 0.
      await runImpact(cwd, parseImpactArgs(rest));

      return 0;
    }

    if (command === 'deps') {
      const { ok } = await runDeps(cwd, parseDepsArgs(rest));

      return ok ? 0 : 1;
    }

    if (command === 'rules') {
      // The catalog is an answer, never a verdict — exit 0 like impact.
      await runRules(cwd, parseRulesArgs(rest));

      return 0;
    }

    if (command === 'doctor') {
      const { ok } = await runDoctor(cwd, parseDoctorArgs(rest));

      return ok ? 0 : 1;
    }
  } catch (error) {
    console.error(`✗ ${(error as Error).message}`);

    return 1;
  }

  console.log(USAGE);

  return command === undefined ? 0 : 1;
}

/**
 * True when this file is the process entry point. npm installs the bin as a
 * symlink (`node_modules/.bin/blueprint`), and Node resolves the *entry
 * module* to its real path while `argv[1]` keeps the symlink path — so the
 * comparison must run through `realpathSync`, or the published CLI is a
 * silent no-op (the 0.1.1 bug).
 */
export function isCliEntry(argv1: string | undefined): boolean {
  // Undecidable: the `catch` below keeps this one honest — `realpathSync(undefined)`
  // throws, and the catch answers `false` too. Removing either alone still passes;
  // the contract itself is pinned by a test (`isCliEntry(undefined)`).
  if (argv1 === undefined) {
    return false;
  }

  try {
    return import.meta.url === pathToFileURL(realpathSync(argv1)).href;
  } catch {
    return false; // argv1 does not exist on disk — not our entry.
  }
}

/* v8 ignore start -- the live bin invocation; isCliEntry itself is unit-tested.
   Its mutants are undecidable in-process too: this module is imported by the tests,
   never executed as the entry, so flipping the condition changes nothing they can
   see. `npm run dist:verify` runs the built bin through an npm-style symlink, which
   is the check that catches it — the 0.1.1 bug, where the published CLI exited 0
   having done nothing while every in-process test passed. */
if (isCliEntry(process.argv[1])) {
  run(process.argv.slice(2)).then((code) => process.exit(code));
}
/* v8 ignore stop */
