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

export function version(dir: string = path.dirname(fileURLToPath(import.meta.url))): string {
  for (const relative of ['../package.json', '../../package.json']) {
    const file = path.join(dir, relative);

    if (fs.existsSync(file)) {
      return (JSON.parse(fs.readFileSync(file, 'utf-8')) as { version: string }).version;
    }
  }

  return 'unknown';
}

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

  ['impact', async (cwd, rest) => {
    await runImpact(cwd, parseImpactArgs(rest));

    return 0;
  }],
  ['deps', async (cwd, rest) => ((await runDeps(cwd, parseDepsArgs(rest))).ok ? 0 : 1)],

  ['rules', async (cwd, rest) => {
    await runRules(cwd, parseRulesArgs(rest));

    return 0;
  }],
  ['doctor', async (cwd, rest) => ((await runDoctor(cwd, parseDoctorArgs(rest))).ok ? 0 : 1)],
]);

export async function run(argv: string[], cwd: string = process.cwd()): Promise<number> {
  const [command, ...rest] = argv;
  const help = helpText(command, rest);

  if (help !== null) {
    console.log(help);

    return 0;
  }

  try {
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

function helpText(command: string | undefined, rest: string[]): string | null {
  if (command === '--help' || command === '-h') {
    return USAGE;
  }

  if (command === '--version' || command === '-v') {
    return version();
  }

  const help = Object.hasOwn(COMMAND_HELP, command ?? '')
    ? COMMAND_HELP[command as string]
    : undefined;

  return help !== undefined && (rest.includes('--help') || rest.includes('-h')) ? help : null;
}

function assertFlagsKnown(command: string, rest: string[]): void {
  const known = Object.hasOwn(KNOWN_FLAGS, command) ? KNOWN_FLAGS[command] : undefined;

  if (known !== undefined) {
    rejectUnknownFlags(known, command, rest);
  }
}

export function isCliEntry(argv1: string | undefined): boolean {
  // Stryker disable next-line BlockStatement, ConditionalExpression: same false catch.
  if (argv1 === undefined) {
    return false;
  }

  try {
    return import.meta.url === pathToFileURL(realpathSync(argv1)).href;
  } catch {
    return false;
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
