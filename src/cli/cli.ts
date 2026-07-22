#!/usr/bin/env node
import fs, { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { AGENT_KINDS, BROWNFIELD_MIN_FILES, runInit } from '../bootstrap';
import type { AgentKind, InitOptions } from '../bootstrap';
import { runImpact } from '../impact';
import type { ImpactOptions } from '../impact';
import { runDeps, runDoctor, runInspect, runRules } from '../inspect';
import type { DepsOptions, DoctorOptions, InspectOptions, RulesOptions } from '../inspect';
import { runSurvey } from '../survey';
import type { SurveyOptions } from '../survey';

const USAGE = [
  'blueprint — Architecture as Code. One blueprint compiles into ESLint rules,',
  'a human handbook, an AI agent contract, and a CI gate.',
  '',
  'Usage:',
  '  blueprint init      Scaffold it all: layers, lint, docs, agent contracts, CI.',
  '                      On a brownfield repo with no config, emits the authoring',
  '                      playbook instead (--agent claude|codex launches it).',
  '  blueprint survey    Deterministic repo evidence: folders, import matrix,',
  '                      module shapes — the raw material for authoring a config.',
  '  blueprint inspect   Read-only architecture report (CI-gateable).',
  '  blueprint impact    Dry-run the emitted lint rules: what would wiring',
  '                      emitLint flag today, per rule? Never a gate.',
  '  blueprint deps      Reverse dependencies / blast radius per module.',
  '  blueprint rules     The emitted-rule catalog: what always emits, what needs',
  '                      declaring, defaults — annotated with your config\'s tiers.',
  '  blueprint doctor    Is adoption finished? A read-only completeness check.',
  '  blueprint --help | --version',
  '',
  'Run `blueprint <command> --help` for flags and details.',
].join('\n');

const INIT_HELP = [
  'blueprint init — scaffold the architecture operating contract.',
  '',
  'With a blueprint.config.mjs (or on a fresh repo, from a preset), generates:',
  '  · src/<layer>/ folders — only into an empty tree; where code already',
  '    lives, an unbuilt layer\'s absence is its true state (no .gitkeep shells)',
  '  · eslint.config.mjs — structural rules + the embedded plugin',
  '  · docs/architecture-handbook.md and AI agent contracts (CLAUDE.md, AGENTS.md)',
  '  · compilerOptions.paths for the import alias (lossless edits only)',
  '  · .github/workflows/blueprint-ci.yml — lint + inspect as the gate',
  '',
  'On a brownfield repo WITHOUT a config, init does not guess: it surveys the',
  'code and writes blueprint-authoring.md — an executable playbook for deriving',
  'the config — plus a /blueprint-author command for Claude Code. An agent (or',
  'you) executes it, then init runs again down the normal path. A repo below the',
  'file-count threshold scaffolds a preset instead (no playbook written) — force',
  'the playbook with --authoring, or force the preset with --preset.',
  '',
  'Framework presets: vue / react auto-detected; a Next.js project uses the',
  'Next preset (route tree detected as app / pages, under src/ or the root).',
  'Nuxt is unsupported — its auto-imports defeat static analysis, so init',
  'refuses rather than emit a hollow, false-green setup.',
  '',
  'Flags:',
  '  --agent claude|codex    After writing the playbook, launch that agent CLI',
  '                          on it (foreground, interactive, your own CLI and',
  '                          permissions). Every artifact is on disk before the',
  '                          spawn — if the launch fails, the manual path is',
  '                          already complete. On the preset path NOTHING is',
  '                          launched — the flag narrows the agent contracts',
  '                          to that one tool (CLAUDE.md or AGENTS.md, not',
  '                          both), safe in headless runs, and a scaffolded',
  '                          config carries emit.agents so the choice',
  '                          persists. An existing config keeps its own',
  '                          emit.agents declaration.',
  '  --preset                Skip the authoring flow: scaffold the framework',
  '                          preset even on a brownfield repo.',
  '  --authoring             Force the authoring playbook even on a small repo',
  `                          (below the brownfield threshold, ${BROWNFIELD_MIN_FILES} source files).`,
  '                          Opposite of --preset; the two cannot be combined.',
  '  --framework vue|react   Only needed when package.json detection is',
  '                          ambiguous — vue/react is otherwise auto-detected.',
  '  --no-install            Skip dependency installation.',
  '  --dry-run               Print the plan, write nothing (never launches).',
  '',
  'An existing eslint config is never overwritten — init writes a reference',
  'file to merge from instead (only the config init generated itself, marked',
  'by its first-line banner, is regenerated in place). Re-running init is',
  'idempotent.',
  '',
  'Examples:',
  '  npx @kekkai/blueprint init --dry-run        # see the plan first',
  '  npx @kekkai/blueprint init                  # scaffold + install',
  '  npx @kekkai/blueprint init --agent claude   # brownfield: agent authors the config',
].join('\n');

const SURVEY_HELP = [
  'blueprint survey — deterministic evidence for authoring a blueprint.',
  '',
  'Runs without a config (it serves the moment before one exists). Reports:',
  '  · top-level src/ folders with module-shape evidence (files, child folders,',
  '    index coverage, nesting depth) and the src-root wiring files',
  '  · the folder-to-folder import matrix (alias + relative), heaviest first',
  '  · same-folder alias imports, test-convention hits',
  '  · package-usage concentration — ownership candidates',
  '',
  'Facts only, no judgment: deciding which folders are layers and which way',
  'the flow points is the authoring step (see `blueprint init` on brownfield).',
  '',
  'Flags:',
  '  --alias <name>   Import alias when tsconfig paths detection finds none.',
  '  --json           Machine-readable output.',
  '',
  'Examples:',
  '  npx @kekkai/blueprint survey             # human-readable evidence report',
  '  npx @kekkai/blueprint survey --json      # feed it to tooling / an agent',
].join('\n');

const INSPECT_HELP = [
  'blueprint inspect — read-only architecture report.',
  '',
  'Scans src/, checks it against the blueprint, and reports: undeclared',
  'folders, flow violations, deep imports, package ownership, relative',
  'escapes, missing module entries, selfOnly re-exports, import cycles,',
  'and declared layers with no folder yet (info).',
  'Any error-level finding exits 1, so it drops straight into CI. Test files',
  '(architecture.testFiles) are exempt, matching the lint side. The report ends',
  'with a coverage line — how many source files the layer globs actually reach',
  'and how many optional gates are active (structural rules are always on) —',
  'so an empty net cannot pass as green.',
  '',
  'Flags:',
  '  --framework vue|react   Force the preset when detection is ambiguous.',
  '  --json                  Machine-readable output.',
  '  --update-baseline       Record the current error/warn findings as the',
  '                          accepted debt (.blueprint-baseline.json), then',
  '                          exit 0. Info notes are not debt and never enter',
  '                          the ledger; zero debt writes no file at all.',
  '  --baseline              Fail only on findings NOT in the baseline — the',
  '                          brownfield ratchet: stop getting worse today,',
  '                          tighten as debt is paid down.',
  '',
  'Examples:',
  '  npx @kekkai/blueprint inspect --update-baseline   # adopt: lock today\'s debt',
  '  npx @kekkai/blueprint inspect --baseline          # CI: fail only on new findings',
].join('\n');

const IMPACT_HELP = [
  'blueprint impact — dry-run the emitted lint rules before wiring them.',
  '',
  'Requires an authored blueprint.config.mjs. Compiles it with emitLint, runs',
  'the project\'s OWN eslint over the layer files with only that config, and',
  'reports what wiring would flag today — hits per rule, heaviest files named.',
  'Rule conflicts get decided on numbers instead of reverse-engineering the',
  'emitted config against the code by hand.',
  '',
  'Informational, never a gate: the exit code is 0 whatever the count — and',
  'the total counts ONLY violations the wiring would introduce. Everything',
  'else renders apart and never inflates it: `parse-error` (a file could not',
  'be parsed; its numbers are untrustworthy) and `unused-disable-directive`',
  '(an inline disable suppressing nothing HERE — one pointing at your own',
  'config\'s rules vanishes after the merge, a truly stale one survives it)',
  'sit under "Isolation caveats"; rules that are not blueprint\'s at all sit',
  'in their own section. Confirm both against your full lint.',
  '',
  'Needs from the project: eslint ≥ 9, plus typescript-eslint on TypeScript',
  'and vue-eslint-parser on Vue (init installs all of these).',
  '',
  'Flags:',
  '  --json                  Machine-readable output.',
  '',
  'Examples:',
  '  npx @kekkai/blueprint impact          # how red would the wiring be?',
  '  npx @kekkai/blueprint impact --json   # feed the counts to tooling / an agent',
].join('\n');

const DEPS_HELP = [
  'blueprint deps [module] — reverse dependencies / blast radius.',
  '',
  'With a module (e.g. `hooks/useCart`, or a file path — both work), answers',
  '"who gets hit if I change this": every importer, and every import. Without',
  'one, prints the blast-radius leaderboard — all modules sorted by fan-in.',
  '',
  'Scope and granularity:',
  '  · Only modules under the declared layers are in the graph — folders',
  '    outside them are listed as skipped, never silently ignored.',
  '  · A `folder`-layout layer answers per module; a `flat`-layout layer',
  '    (e.g. a Next route tree) collapses to one node — layer granularity.',
  '  · Test files are excluded; only alias + relative imports form edges.',
  '',
  'Flags:',
  '  --framework vue|react   Force the preset when detection is ambiguous.',
  '  --json                  Machine-readable output.',
  '',
  'Examples:',
  '  npx @kekkai/blueprint deps hooks/useCart   # who gets hit if I change this',
  '  npx @kekkai/blueprint deps                 # fan-in leaderboard',
].join('\n');

const RULES_HELP = [
  'blueprint rules — the emitted-rule catalog, queryable.',
  '',
  'Read-only, config-optional. Answers what field agents used to dig out of',
  'the minified bundle:',
  '  · Structural rules — always emitted; `emit.lint.severity` covers ONLY',
  '    these (no-restricted-imports/-syntax/-globals, blueprint/relative-escape)',
  '  · Optional gates — emitted only when declared in `rules` with a tier',
  '    other than off; metric defaults shown (maxLines 400, complexity 12, …)',
  '  · Documentation-only ids — never an ESLint line (deadCode → knip;',
  '    cycles is enforced by `inspect`, not the lint config)',
  '',
  'With a blueprint.config.mjs present, every gate is annotated with the',
  'declared tier/value and whether it emits today (e.g. deepWatch declared',
  'on a React project never emits).',
  '',
  'Flags:',
  '  --json                  Machine-readable output.',
  '',
  'Examples:',
  '  npx @kekkai/blueprint rules           # what would wiring actually enforce?',
  '  npx @kekkai/blueprint rules --json    # feed the catalog to tooling / an agent',
].join('\n');

const DOCTOR_HELP = [
  'blueprint doctor — is adoption actually finished?',
  '',
  'Read-only. Runs the completeness checks the adoption prompt asks for as a',
  'checklist, and exits 1 if any fails — so it drops into CI or an agent verify',
  'loop:',
  '  · blueprint.config.mjs present',
  '  · no leftover *.blueprint.* reference files, and no stale agent',
  '    contracts — a marker-bearing CLAUDE.md/AGENTS.md/… outside the',
  '    emitted set cannot hide behind green',
  '  · eslint wired to emitLint (a legacy .eslintrc is flagged to migrate first)',
  '  · import alias wired to the toolchain — a declared alias that neither',
  '    tsconfig paths nor a bundler config (vite / webpack / vue-cli / next /',
  '    rsbuild) resolves would send agents into unresolvable imports',
  '  · emitted rules survive the merged eslint config — flat config never',
  '    merges a rule two entries set; if a later entry replaced blueprint\'s',
  '    structural bans (lint stays green, a defense silently dies), this',
  '    turns red and names what was lost',
  '  · architecture clean — no findings outside the baseline, if one is in play;',
  '    the detail states the coverage (files inside layer nets, active optional',
  '    gates), so a vacuously green gate is visible instead of quietly reassuring',
  '  · lint suppressions ledger current — stale entries in',
  '    eslint-suppressions.json (files that no longer exist) fail the check',
  '',
  'Flags:',
  '  --json                  Machine-readable output.',
  '',
  'Examples:',
  '  npx @kekkai/blueprint doctor          # what is left before adoption is done',
  '  npx @kekkai/blueprint doctor --json   # feed the checklist to tooling / an agent',
].join('\n');

const COMMAND_HELP: Record<string, string> = {
  init: INIT_HELP,
  survey: SURVEY_HELP,
  inspect: INSPECT_HELP,
  impact: IMPACT_HELP,
  deps: DEPS_HELP,
  rules: RULES_HELP,
  doctor: DOCTOR_HELP,
};

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

function parseAgent(value: string | undefined): AgentKind | undefined {
  return (AGENT_KINDS as readonly string[]).includes(value ?? '')
    ? (value as AgentKind)
    : undefined;
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
    } else if (arg === '--preset') {
      options.preset = true;
    } else if (arg === '--authoring') {
      options.authoring = true;
    } else if (arg === '--agent') {
      const agent = parseAgent(args[++i]);

      if (!agent) {
        throw new Error(`--agent expects one of: ${AGENT_KINDS.join(' | ')}.`);
      }

      options.agent = agent;
    } else if (arg === '--framework') {
      options.framework = parseFramework(args[++i]) ?? options.framework;
    }
  }

  return options;
}

/** Parse `survey` flags. Unknown flags are ignored. */
export function parseSurveyArgs(args: string[]): SurveyOptions {
  const options: SurveyOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--alias') {
      options.alias = args[++i];
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
    } else if (arg === '--baseline') {
      options.baseline = true;
    } else if (arg === '--update-baseline') {
      options.updateBaseline = true;
    } else if (arg === '--framework') {
      options.framework = parseFramework(args[++i]) ?? options.framework;
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
 * Every flag each command answers to. Unknown flags fail loud instead of
 * being silently ignored — a field agent tried `inspect --verbose`, saw
 * identical output, and reasonably concluded the flag was a broken no-op.
 */
const KNOWN_FLAGS: Record<string, Set<string>> = {
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

function rejectUnknownFlags(command: string, args: string[]): void {
  const known = KNOWN_FLAGS[command];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (!arg.startsWith('-')) continue;

    if (!known.has(arg)) {
      throw new Error(`unknown flag for ${command}: ${arg} — see: blueprint ${command} --help`);
    }

    if (VALUED_FLAGS.has(arg)) i++;
  }
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
    if (command !== undefined && command in KNOWN_FLAGS) {
      rejectUnknownFlags(command, rest);
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
