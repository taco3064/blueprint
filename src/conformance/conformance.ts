import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Blueprint } from '../config';
import { emitLint } from '../emit/lint';
import { run } from '../cli';

/**
 * The adoption conformance fixture DSL. Every round of field feedback used
 * to end as a hand-built scratch repo proving a fix; this module fossilizes
 * those repos so every known adoption scenario is a regression test — field
 * runs should only ever discover *new* scenarios, never re-discover old
 * ones. Test-only: nothing here is exported from the package entry.
 */

export interface CliResult {
  code: number;
  output: string;
}

/** Run the real CLI dispatch in `dir`, capturing stdout/stderr text. */
export async function cli(dir: string, argv: string[]): Promise<CliResult> {
  const lines: string[] = [];
  const log = console.log;
  const error = console.error;

  console.log = (message?: unknown) => void lines.push(String(message));
  console.error = (message?: unknown) => void lines.push(String(message));

  try {
    return { code: await run(argv, dir), output: lines.join('\n') };
  } finally {
    console.log = log;
    console.error = error;
  }
}

export interface RepoSpec {
  packageJson?: Record<string, unknown>;
  files?: Record<string, string>;
}

/** Scaffold a throwaway fixture repo. Callers own the cleanup via {@link rm}. */
export function makeRepo(spec: RepoSpec = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-conformance-'));

  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(spec.packageJson ?? { name: 'fixture' }),
  );

  for (const [rel, content] of Object.entries(spec.files ?? {})) {
    write(dir, rel, content);
  }

  return dir;
}

export function write(dir: string, rel: string, content: string): void {
  const full = path.join(dir, rel);

  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

/** File content, or null when absent — assert both existence and shape. */
export function read(dir: string, rel: string): string | null {
  try {
    return fs.readFileSync(path.join(dir, rel), 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Collapse every whitespace run, so an assertion names the sentence it cares
 * about and not the column the source happened to break at.
 *
 * The authoring playbook is prose hand-wrapped at ~72 columns inside a template
 * literal: editing one word re-wraps the rest of its paragraph. Assertions that
 * carried a `\n` — plus the continuation indent — in the needle were therefore
 * pinned to the wrapping, and the two failure directions are not symmetric. A
 * positive one goes red on a re-wrap that changed no meaning: noise, but you see
 * it. A negative one goes green, because a needle that stops matching is exactly
 * what `not.toContain` asks for — it quietly stops carrying any signal instead.
 * Measured, not assumed: re-wrapping the `.claude/` sentence and inverting its
 * ternary leaves `not.toContain('init created\n   only to hold this command')`
 * passing, and the case is caught only by the two positive assertions beside it.
 * So the cost of a wrap-pinned negative is a dead assertion, not a missed bug —
 * still worth removing, because an assertion that cannot fail reads as cover.
 *
 * Whitespace only: punctuation, wording and order still have to match, and a
 * needle spanning a paragraph break is deliberately still a match — these
 * assertions are about prose, so the structural ones stay raw.
 */
export function flattenProse(text: string): string {
  return text.replace(/\s+/g, ' ');
}

export function rm(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * A self-contained `blueprint.config.mjs` body — fixture repos have no
 * node_modules, so the config must not import the package.
 */
export function configSource(blueprint: Blueprint): string {
  return `export default ${JSON.stringify(blueprint)};\n`;
}

/**
 * An eslint flat config whose entries are emitLint's real output, inlined
 * as data: the fixture cannot import `@kekkai/blueprint` (no node_modules),
 * and doctor's survival check only *resolves* configs — it never lints — so
 * a stub `blueprint` plugin object satisfies resolution. The marker comment
 * keeps detect's wired-by-text heuristic satisfied the same way a real
 * spread would.
 */
export function wiredEslintConfig(blueprint: Blueprint, extraEntries = ''): string {
  const entries = emitLint(blueprint).map((entry) => {
    const { plugins, ...rest } = entry;

    return plugins
      ? `{ ...${JSON.stringify(rest)}, plugins: { blueprint: stub } }`
      : JSON.stringify(rest);
  });

  // Every `blueprint/*` id the emitted config actually references, derived
  // rather than listed: ESLint refuses to resolve a config naming a rule its
  // plugin does not define, so a hardcoded stub turns "this ticket added a
  // rule" into "doctor could not resolve the config" — a skip riding on
  // `ok: true`, which is the one outcome this fixture exists to disprove.
  const stubbed = [
    ...new Set(
      emitLint(blueprint)
        .flatMap((entry) => Object.keys(entry.rules ?? {}))
        .filter((rule) => rule.startsWith('blueprint/'))
        .map((rule) => rule.slice('blueprint/'.length)),
    ),
  ];

  return [
    '// wired from @kekkai/blueprint emitLint — inlined for the conformance fixture',
    // Without a permissive schema, ESLint 9 defaults to "zero options" and
    // rejects the {layouts} option during config resolution.
    'const stub = { rules: {',
    ...stubbed.map((rule) => `  '${rule}': {`
      + ' meta: { schema: [{ type: \'object\', additionalProperties: true }] },'
      + ' create: () => ({}) },'),
    '} };',
    '',
    'export default [',
    ...entries.map((entry) => `  ${entry},`),
    ...(extraEntries ? [extraEntries] : []),
    '];',
    '',
  ].join('\n');
}
