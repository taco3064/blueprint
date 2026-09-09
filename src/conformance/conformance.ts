import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect } from 'vitest';
import type { Blueprint } from '../config';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURES = path.join(ROOT, 'src', 'conformance', 'fixtures');
const TEST_ROOT = path.join(os.tmpdir(), 'blueprint-conformance');

let cwd = '';

beforeEach(() => {
  cwd = fs.mkdtempSync(`${TEST_ROOT}-`);
});

afterEach(() => {
  if (cwd) {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

export function fixture(name: string): string {
  return path.join(FIXTURES, name);
}

export function tempRoot(): string {
  return cwd;
}

export function write(relative: string, content: string): void {
  const target = path.join(cwd, relative);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

export function read(relative: string): string {
  return fs.readFileSync(path.join(cwd, relative), 'utf8');
}

export function exists(relative: string): boolean {
  return fs.existsSync(path.join(cwd, relative));
}

export function copyFixture(name: string): void {
  fs.cpSync(fixture(name), cwd, { recursive: true });
}

export function expectFile(relative: string): void {
  expect(exists(relative), `${relative} should exist`).toBe(true);
}

export function expectNoFile(relative: string): void {
  expect(exists(relative), `${relative} should not exist`).toBe(false);
}

export function eslintConfig(entries: string[], extraEntries = ''): string {
  return [
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
