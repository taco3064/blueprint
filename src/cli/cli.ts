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

/**
 * One entry per command, keyed the same way `KNOWN_FLAGS` and `COMMAND_HELP` are.
 * A Map rather than an object literal: a bare record answers `blueprint constructor`
 * with something off Object.prototype.
 */
const COMMANDS = new Map<string, (cwd: string, rest: string[]) => Promise<number>>([
  ['init', async (cwd, rest) => {
    await runInit(cwd, parseInitArgs(rest));

    return 0;
  }],
  ['survey', async (cwd, rest) => {
    runSurvey(cwd, parseSurveyArgs(rest));

    return 0;
  }],
  ['inspect', async (cwd, rest) => ((await runInspect(cwd, parseInspectArgs(rest))).ok ? 0 : 1)],
  // Informational dry-run — any hit count is a valid answer, so exit 0.
  ['impact', async (cwd, rest) => {
    await runImpact(cwd, parseImpactArgs(rest));

    return 0;
  }],
  ['deps', async (cwd, rest) => ((await runDeps(cwd, parseDepsArgs(rest))).ok ? 0 : 1)],
  // The catalog is an answer, never a verdict — exit 0 like impact.
  ['rules', async (cwd, rest) => {
    await runRules(cwd, parseRulesArgs(rest));

    return 0;
  }],
  ['doctor', async (cwd, rest) => ((await runDoctor(cwd, parseDoctorArgs(rest))).ok ? 0 : 1)],
]);

/** CLI dispatch. Returns the process exit code. */
export async function run(argv: string[], cwd: string = process.cwd()): Promise<number> {
  const [command, ...rest] = argv;
  const help = helpText(command, rest);

  if (help !== null) {
    console.log(help);

    return 0;
  }

  try {
    // Before the dispatch, so an unknown command is still told which flags it got
    // wrong — and so a command that declares no flag set has a reachable arm.
    assertFlagsKnown(command ?? '', rest);

    const handler = COMMANDS.get(command ?? '');

    if (handler === undefined) {
      console.log(USAGE);

      return command === undefined ? 0 : 1;
    }

    return await handler(cwd, rest);
  } catch (error) {
    console.error(`✗ ${(error as Error).message}`);

    return 1;
  }
}

/**
 * What gets printed INSTEAD of running anything: the two top-level flags, and a
 * command asked for its own help. Null when the argv is a real invocation.
 */
function helpText(command: string | undefined, rest: string[]): string | null {
  if (command === '--help' || command === '-h') {
    return USAGE;
  }

  if (command === '--version' || command === '-v') {
    return version();
  }

  // `Object.hasOwn` over `in`: `hasOwn(record, '')` is false, which is the answer
  // wanted for "no command given", and it does not walk the prototype chain.
  const help = Object.hasOwn(COMMAND_HELP, command ?? '')
    ? COMMAND_HELP[command as string]
    : undefined;

  return help !== undefined && (rest.includes('--help') || rest.includes('-h')) ? help : null;
}

/** A command that declares its own flag set only accepts those flags. */
function assertFlagsKnown(command: string, rest: string[]): void {
  // `Object.hasOwn` for the same reason as `helpText`: `KNOWN_FLAGS` is a bare
  // record whose type says every key holds a Set, and `constructor` holds a
  // function.
  const known = Object.hasOwn(KNOWN_FLAGS, command) ? KNOWN_FLAGS[command] : undefined;

  if (known !== undefined) {
    rejectUnknownFlags(known, command, rest);
  }
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
