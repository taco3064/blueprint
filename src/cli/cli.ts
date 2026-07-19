#!/usr/bin/env node
import fs, { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runInit } from '../bootstrap';
import type { InitOptions } from '../bootstrap';
import { runInspect } from '../inspect';
import type { InspectOptions } from '../inspect';

const USAGE = [
  'blueprint — Architecture as Code. One blueprint compiles into ESLint rules,',
  'a human handbook, an AI agent contract, and a CI gate.',
  '',
  'Usage:',
  '  blueprint init      Scaffold it all: layers, lint, docs, agent contracts, CI.',
  '  blueprint inspect   Read-only architecture report (CI-gateable).',
  '  blueprint --help | --version',
  '',
  'Run `blueprint <command> --help` for flags and details.',
].join('\n');

const INIT_HELP = [
  'blueprint init — scaffold the architecture operating contract.',
  '',
  'Generates:',
  '  · src/<layer>/ folders for every declared layer',
  '  · blueprint.config.mjs (vue/react preset, or loaded when one exists)',
  '  · eslint.config.mjs — structural rules + the embedded plugin',
  '  · docs/architecture-handbook.md and AI agent contracts (CLAUDE.md, AGENTS.md)',
  '  · compilerOptions.paths for the import alias (lossless edits only)',
  '  · .github/workflows/blueprint-ci.yml — lint + inspect as the gate',
  '',
  'Flags:',
  '  --framework vue|react   Only needed when package.json detection is',
  '                          ambiguous — vue/react is otherwise auto-detected.',
  '  --no-install            Skip dependency installation.',
  '  --dry-run               Print the plan, write nothing.',
  '',
  'An existing eslint config is never overwritten — init prints a merge',
  'snippet instead. Re-running init is idempotent.',
].join('\n');

const INSPECT_HELP = [
  'blueprint inspect — read-only architecture report.',
  '',
  'Scans src/, checks it against the blueprint, and reports: undeclared',
  'folders, flow violations, deep imports, package ownership, relative',
  'escapes, missing module entries, selfOnly re-exports, import cycles.',
  'Any error-level finding exits 1, so it drops straight into CI.',
  '',
  'Flags:',
  '  --framework vue|react   Force the preset when detection is ambiguous.',
  '  --json                  Machine-readable output.',
].join('\n');

const COMMAND_HELP: Record<string, string> = { init: INIT_HELP, inspect: INSPECT_HELP };

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

  if (command === '--help' || command === '-h') {
    console.log(USAGE);

    return 0;
  }

  if (command === '--version' || command === '-v') {
    console.log(version());

    return 0;
  }

  if (command !== undefined && command in COMMAND_HELP
    && (rest.includes('--help') || rest.includes('-h'))) {
    console.log(COMMAND_HELP[command]);

    return 0;
  }

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

/**
 * True when this file is the process entry point. npm installs the bin as a
 * symlink (`node_modules/.bin/blueprint`), and Node resolves the *entry
 * module* to its real path while `argv[1]` keeps the symlink path — so the
 * comparison must run through `realpathSync`, or the published CLI is a
 * silent no-op (the 0.1.1 bug).
 */
export function isCliEntry(argv1: string | undefined): boolean {
  if (argv1 === undefined) return false;

  try {
    return import.meta.url === pathToFileURL(realpathSync(argv1)).href;
  } catch {
    return false; // argv1 does not exist on disk — not our entry.
  }
}

/* v8 ignore start -- the live bin invocation; isCliEntry itself is unit-tested */
if (isCliEntry(process.argv[1])) {
  run(process.argv.slice(2)).then((code) => process.exit(code));
}
/* v8 ignore stop */
