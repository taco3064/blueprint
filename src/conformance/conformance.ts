import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Blueprint } from '../config';
import { emitLint } from '../emit/lint';
import { run } from '../cli';

export interface CliResult {
  code: number;
  output: string;
}

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

export function read(dir: string, rel: string): string | null {
  try {
    return fs.readFileSync(path.join(dir, rel), 'utf-8');
  } catch {
    return null;
  }
}

export function flattenProse(text: string): string {
  return text.replace(/\s+/g, ' ');
}

export function rm(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

export function configSource(blueprint: Blueprint): string {
  return `export default ${JSON.stringify(blueprint)};\n`;
}

export function wiredEslintConfig(blueprint: Blueprint, extraEntries = ''): string {
  const entries = emitLint(blueprint).map((entry) => {
    const { plugins, ...rest } = entry;

    return plugins
      ? `{ ...${JSON.stringify(rest)}, plugins: { blueprint: stub } }`
      : JSON.stringify(rest);
  });

  return [
    '// wired from @kekkai/blueprint emitLint — inlined for the conformance fixture',

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

export const react = (deps: Record<string, string> = {}) => ({
  name: 'fixture',
  dependencies: { react: '^18.0.0', ...deps },
});

export const reactBlueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'components', does: 'render UI' },
      { name: 'services', does: 'data access' },
    ],
  },
  rules: { unusedVars: 'error' },
};
