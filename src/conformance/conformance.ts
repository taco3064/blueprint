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

  return [
    '// wired from @kekkai/blueprint emitLint — inlined for the conformance fixture',
    // Without a permissive schema, ESLint 9 defaults to "zero options" and
    // rejects the {layouts} option during config resolution.
    'const stub = { rules: { \'relative-escape\': {',
    '  meta: { schema: [{ type: \'object\', additionalProperties: true }] },',
    '  create: () => ({}),',
    '} } };',
    '',
    'export default [',
    ...entries.map((entry) => `  ${entry},`),
    ...(extraEntries ? [extraEntries] : []),
    '];',
    '',
  ].join('\n');
}
