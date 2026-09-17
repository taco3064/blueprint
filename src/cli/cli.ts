#!/usr/bin/env node
import fs, { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runInit } from '../bootstrap';
import { runImpact } from '../impact';
import { runDeps, runDoctor, runInspect, runRules } from '../inspect';
import { runSurvey } from '../survey';
import { runRemove } from '../remove';
import { runUpgrade } from '../upgrade';
import { renderCliFailure, renderCliVersion } from '../operational-contract';
import type { OperationalCommand, OperationalText } from '../operational-contract';
import {
  KNOWN_FLAGS,
  parseDepsArgs,
  parseDoctorArgs,
  parseImpactArgs,
  parseInitArgs,
  parseInspectArgs,
  parseRulesArgs,
  parseRemoveArgs,
  parseSurveyArgs,
  parseUpgradeArgs,
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

const COMMANDS = {
  init: async (cwd: string, rest: string[]) => {
    await runInit(cwd, parseInitArgs(rest));

    return 0;
  },
  survey: async (cwd: string, rest: string[]) => {
    runSurvey(cwd, parseSurveyArgs(rest));

    return 0;
  },
  inspect: async (cwd: string, rest: string[]) => (
    (await runInspect(cwd, parseInspectArgs(rest))).ok ? 0 : 1
  ),

  impact: async (cwd: string, rest: string[]) => {
    await runImpact(cwd, parseImpactArgs(rest));

    return 0;
  },
  deps: async (cwd: string, rest: string[]) => (
    (await runDeps(cwd, parseDepsArgs(rest))).ok ? 0 : 1
  ),

  rules: async (cwd: string, rest: string[]) => {
    await runRules(cwd, parseRulesArgs(rest));

    return 0;
  },
  doctor: async (cwd: string, rest: string[]) => (
    (await runDoctor(cwd, parseDoctorArgs(rest))).ok ? 0 : 1
  ),
  upgrade: (cwd: string, rest: string[]) => runUpgrade(cwd, parseUpgradeArgs(rest)),
  remove: (cwd: string, rest: string[]) => runRemove(cwd, parseRemoveArgs(rest)),
} satisfies Record<OperationalCommand, (cwd: string, rest: string[]) => Promise<number>>;

export async function run(argv: string[], cwd: string = process.cwd()): Promise<number> {
  const [command, ...rest] = argv;

  if (command === '--version' || command === '-v') {
    return printVersion();
  }

  const help = helpText(command, rest);

  if (help !== null) {
    return printHelp(help);
  }

  try {
    assertFlagsKnown(command ?? '', rest);

    const handler = Object.hasOwn(COMMANDS, command ?? '')
      ? COMMANDS[command as OperationalCommand]
      : undefined;

    if (handler === undefined) {
      console.log(USAGE);

      return command === undefined ? 0 : 1;
    }

    return await handler(cwd, rest);
  } catch (error) {
    console.error(renderCliFailure((error as Error).message));

    return 1;
  }
}

function printVersion(): number {
  console.log(renderCliVersion(version()));

  return 0;
}

function printHelp(help: OperationalText): number {
  console.log(help);

  return 0;
}

function helpText(command: string | undefined, rest: string[]): OperationalText | null {
  if (command === '--help' || command === '-h') {
    return USAGE;
  }

  const help = Object.hasOwn(COMMAND_HELP, command ?? '')
    ? COMMAND_HELP[command as keyof typeof COMMAND_HELP]
    : undefined;

  return help !== undefined && (rest.includes('--help') || rest.includes('-h')) ? help : null;
}

function assertFlagsKnown(command: string, rest: string[]): void {
  const known = Object.hasOwn(KNOWN_FLAGS, command)
    ? KNOWN_FLAGS[command as keyof typeof KNOWN_FLAGS]
    : undefined;

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
   Its mutants are unobservable in-process too: this module is imported by the tests,
   never executed as the entry, so flipping the condition changes nothing they can
   see. `npm run dist:verify` runs the built bin through an npm-style symlink, which
   is the check that catches it — the 0.1.1 bug, where the published CLI exited 0
   having done nothing while every in-process test passed. */
// Stryker disable next-line ConditionalExpression: tests import rather than execute this entry.
if (isCliEntry(process.argv[1])) {
  run(process.argv.slice(2)).then((code) => process.exit(code));
}
/* v8 ignore stop */
