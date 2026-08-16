import { AGENT_KINDS } from '../bootstrap';
import type { AgentKind, InitOptions } from '../bootstrap';
import type { ImpactOptions } from '../impact';
import type { DepsOptions, DoctorOptions, InspectOptions, RulesOptions } from '../inspect';
import type { SurveyOptions } from '../survey';

/**
 * argv in, one command's options out — the pure half of the CLI, and the flag
 * allowlist that decides an unknown one is an error rather than a no-op.
 */

function parseFramework(value: string | undefined): 'vue' | 'react' | undefined {
  return value === 'vue' || value === 'react' ? value : undefined;
}

function parseAgent(value: string | undefined): AgentKind | undefined {
  return (AGENT_KINDS as readonly string[]).includes(value ?? '')
    ? (value as AgentKind)
    : undefined;
}

/**
 * Every flag parser below walks a copy of argv as a queue, taking a value flag's
 * value with a second `shift()`. Not an index loop with `args[++i]`: that leaves the
 * bound undecidable, since one past the end is `undefined` and the loop exits having
 * done nothing either way. A queue has no index to get wrong.
 */

/** Parse `init` flags. Unknown flags are ignored. */
export function parseInitArgs(args: string[]): InitOptions {
  const options: InitOptions = {};
  const rest = [...args];

  while (rest.length) {
    const arg = rest.shift();

    if (arg === '--no-install') {
      options.install = false;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--preset') {
      options.preset = true;
    } else if (arg === '--authoring') {
      options.authoring = true;
    } else if (arg === '--agent') {
      const agent = parseAgent(rest.shift());

      if (!agent) {
        throw new Error(`--agent expects one of: ${AGENT_KINDS.join(' | ')}.`);
      }

      options.agent = agent;
    } else if (arg === '--framework') {
      options.framework = parseFramework(rest.shift()) ?? options.framework;
    }
  }

  return options;
}

/** Parse `survey` flags. Unknown flags are ignored. */
export function parseSurveyArgs(args: string[]): SurveyOptions {
  const options: SurveyOptions = {};
  const rest = [...args];

  while (rest.length) {
    const arg = rest.shift();

    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--alias') {
      options.alias = rest.shift();
    }
  }

  return options;
}

/** Parse `inspect` flags. Unknown flags are ignored. */
export function parseInspectArgs(args: string[]): InspectOptions {
  const options: InspectOptions = {};
  const rest = [...args];

  while (rest.length) {
    const arg = rest.shift();

    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--baseline') {
      options.baseline = true;
    } else if (arg === '--update-baseline') {
      options.updateBaseline = true;
    } else if (arg === '--framework') {
      options.framework = parseFramework(rest.shift()) ?? options.framework;
    }
  }

  return options;
}

/** Parse `impact` flags. Unknown flags are ignored. */
export function parseImpactArgs(args: string[]): ImpactOptions {
  return args.includes('--json') ? { json: true } : {};
}

/** Parse `deps` flags; the first non-flag argument is the module to query. */
export function parseDepsArgs(args: string[]): DepsOptions {
  const options: DepsOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--framework') {
      options.framework = parseFramework(args[++i]) ?? options.framework;
    } else if (!arg.startsWith('-') && options.target === undefined) {
      options.target = arg;
    }
  }

  return options;
}

/** Parse `rules` flags. Unknown flags are ignored. */
export function parseRulesArgs(args: string[]): RulesOptions {
  return args.includes('--json') ? { json: true } : {};
}

/** Parse `doctor` flags. Unknown flags are ignored. */
export function parseDoctorArgs(args: string[]): DoctorOptions {
  return args.includes('--json') ? { json: true } : {};
}

/**
 * Every flag each command answers to. Unknown flags fail loud rather than being
 * ignored — silently accepted, `inspect --verbose` reads as a broken no-op.
 */
export const KNOWN_FLAGS: Record<string, Set<string>> = {
  init: new Set(['--agent', '--preset', '--authoring', '--framework', '--no-install', '--dry-run']),
  survey: new Set(['--alias', '--json']),
  inspect: new Set(['--json', '--framework', '--baseline', '--update-baseline']),
  impact: new Set(['--json']),
  deps: new Set(['--json', '--framework']),
  rules: new Set(['--json']),
  doctor: new Set(['--json']),
};

/** Flags that consume the next argument as their value. */
const VALUED_FLAGS = new Set(['--agent', '--framework', '--alias']);

export function rejectUnknownFlags(known: Set<string>, command: string, args: string[]): void {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (!arg.startsWith('-')) {
      continue;
    }

    if (!known.has(arg)) {
      throw new Error(`unknown flag for ${command}: ${arg} — see: blueprint ${command} --help`);
    }

    if (VALUED_FLAGS.has(arg)) {
      i++;
    }
  }
}
