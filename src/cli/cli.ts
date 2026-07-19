#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

import { runInit } from '../bootstrap';
import type { InitOptions } from '../bootstrap';
import { runInspect } from '../inspect';
import type { InspectOptions } from '../inspect';

const USAGE = [
  'Usage:',
  '  blueprint init    [--framework vue|react] [--no-install] [--dry-run]',
  '  blueprint inspect [--framework vue|react] [--json]',
].join('\n');

function parseFramework(value: string | undefined): 'vue' | 'react' | undefined {
  return value === 'vue' || value === 'react' ? value : undefined;
}

/** Parse `init` flags. Unknown flags are ignored. */
export function parseInitArgs(args: string[]): InitOptions {
  const options: InitOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--no-install') {
      options.install = false;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--framework') {
      options.framework = parseFramework(args[++i]) ?? options.framework;
    }
  }

  return options;
}

/** Parse `inspect` flags. Unknown flags are ignored. */
export function parseInspectArgs(args: string[]): InspectOptions {
  const options: InspectOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--framework') {
      options.framework = parseFramework(args[++i]) ?? options.framework;
    }
  }

  return options;
}

/** CLI dispatch. Returns the process exit code. */
export async function run(argv: string[], cwd: string = process.cwd()): Promise<number> {
  const [command, ...rest] = argv;

  try {
    if (command === 'init') {
      await runInit(cwd, parseInitArgs(rest));

      return 0;
    }

    if (command === 'inspect') {
      const { ok } = await runInspect(cwd, parseInspectArgs(rest));

      return ok ? 0 : 1;
    }
  } catch (error) {
    console.error(`✗ ${(error as Error).message}`);

    return 1;
  }

  console.log(USAGE);

  return command === undefined ? 0 : 1;
}

/* v8 ignore start -- bin entry guard, exercised via the published CLI, not unit tests */
function isCliEntry(argv1?: string): boolean {
  return argv1 !== undefined && import.meta.url === pathToFileURL(argv1).href;
}

if (isCliEntry(process.argv[1])) {
  run(process.argv.slice(2)).then((code) => process.exit(code));
}
/* v8 ignore stop */
