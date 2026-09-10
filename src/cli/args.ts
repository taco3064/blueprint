import { AGENT_KINDS } from '../bootstrap';
import type { AgentKind, ArchitectureTopology, InitOptions } from '../bootstrap';
import type { ImpactOptions } from '../impact';
import type { DepsOptions, DoctorOptions, InspectOptions, RulesOptions } from '../inspect';
import type { SurveyOptions } from '../survey';

function parseFramework(value: string | undefined): 'vue' | 'react' | undefined {
  return value === 'vue' || value === 'react' ? value : undefined;
}

function parseAgent(value: string | undefined): AgentKind | undefined {
  return (AGENT_KINDS as readonly string[]).includes(value ?? '')
    ? (value as AgentKind)
    : undefined;
}

function parseTopology(value: string | undefined): ArchitectureTopology {
  if (value !== 'layer-first' && value !== 'module-first') {
    throw new Error('--topology expects one of: layer-first | module-first.');
  }

  return value;
}

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
    } else {
      parseInitValue(arg, rest, options);
    }
  }

  return options;
}

function parseInitValue(
  arg: string | undefined,
  rest: string[],
  options: InitOptions,
): void {
  if (arg === '--topology') {
    const topology = parseTopology(rest.shift());

    if (options.topology && options.topology !== topology) {
      throw new Error('--topology was repeated with conflicting values.');
    }

    options.topology = topology;
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

export function parseSurveyArgs(args: string[]): SurveyOptions {
  const options: SurveyOptions = {};
  const rest = [...args];

  while (rest.length) {
    const arg = rest.shift();

    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--alias') {
      options.alias = rest.shift();
    } else if (arg === '--source-root') {
      options.sourceRoot = rest.shift();
    }
  }

  return options;
}

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

export function parseImpactArgs(args: string[]): ImpactOptions {
  return args.includes('--json') ? { json: true } : {};
}

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

export function parseRulesArgs(args: string[]): RulesOptions {
  return args.includes('--json') ? { json: true } : {};
}

export function parseDoctorArgs(args: string[]): DoctorOptions {
  return args.includes('--json') ? { json: true } : {};
}

export const KNOWN_FLAGS: Record<string, Set<string>> = {
  init: new Set([
    '--agent', '--preset', '--authoring', '--topology', '--framework', '--no-install', '--dry-run',
  ]),
  survey: new Set(['--alias', '--source-root', '--json']),
  inspect: new Set(['--json', '--framework', '--baseline', '--update-baseline']),
  impact: new Set(['--json']),
  deps: new Set(['--json', '--framework']),
  rules: new Set(['--json']),
  doctor: new Set(['--json']),
};

const VALUED_FLAGS = new Set([
  '--agent', '--topology', '--framework', '--alias', '--source-root',
]);

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
