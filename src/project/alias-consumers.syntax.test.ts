import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ArchitectureDef } from '../config';
import { aliasConsumerEvidence } from './alias-consumers';

let root: string;
const architecture = { alias: '#app', layers: [{ name: 'components', does: 'UI' }] };

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-alias-syntax-'));
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function runtime(text: string, arch: ArchitectureDef = architecture, toolRoot = '') {
  return aliasConsumerEvidence(root, arch, {
    root: toolRoot,
    tsconfigs: { 'tsconfig.json': JSON.stringify({ compilerOptions: {
      paths: { '#app/*': ['src/*'] },
    } }) },
    viteConfig: { file: 'vite.config.ts', text },
  })[1].status;
}

describe('alias consumer static syntax', () => {
  it('escapes regular expression characters in aliases', () => {
    expect(runtime('export default {\'#a.pp\': \'/src\'};', { ...architecture, alias: '#a.pp' }))
      .toBe('verified');

    expect(runtime('export default {\'#axpp\': \'/src\'};', { ...architecture, alias: '#a.pp' }))
      .toBe('unverified');
  });

  it.each([
    ['src/<rootDir>/', 'src', 'missing'],
    ['prefix/<rootDir>/src/$1', 'prefix/src', 'missing'],
    ['src/$1/extra', 'src/extra', 'missing'],
    ['<rootDir>/src/$1', 'src', 'verified'],
  ])('recognizes only anchored Jest substitutions %s', (target, sourceRoot, expected) => {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
      jest: { moduleNameMapper: { '^#app/(.*)$': target } },
    }));

    expect(aliasConsumerEvidence(root, { ...architecture, sourceRoot },
      { root: '', tsconfigs: {} })[3].status)
      .toBe(expected);
  });

  it('does not require unrelated Jest mappers to match', () => {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
      jest: { moduleNameMapper: { '^unrelated$': '<rootDir>/src/$1' } },
    }));

    expect(aliasConsumerEvidence(root, architecture, { root: '', tsconfigs: {} })[3].status)
      .toBe('missing');
  });

  it('accepts whitespace between every bridge import token', () => {
    expect(runtime('import   paths   from   \'vite-tsconfig-paths\'; paths();'))
      .toBe('verified');
  });

  it('requires a bridge call after the imported binding', () => {
    expect(runtime('const prefix = \'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ\'; '
      + 'paths(); import paths from \'vite-tsconfig-paths\'; export default {}'))
      .toBe('unverified');
  });

  it('retains a bridge call following a long import prefix', () => {
    expect(runtime('const prefix = \'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ\'; '
      + 'import paths from \'vite-tsconfig-paths\'; paths();'))
      .toBe('verified');
  });

  it('ignores alias declarations in multiline block comments', () => {
    expect(runtime('/* export default {\n \'#app\': \'/src\' }; */ export default {}'))
      .toBe('unverified');
  });

  it('preserves absolute architecture targets in nested tool roots', () => {
    expect(runtime('export default {\'#app\':\'/absolute/src\'};',
      { ...architecture, sourceRoot: '/absolute/src' }, 'apps/web')).toBe('verified');
  });

  it('does not erase parent directory segments or internal wildcards', () => {
    expect(runtime('export default {\'#app\':\'../src\'};',
      { ...architecture, sourceRoot: '../src' })).toBe('verified');

    expect(runtime('export default {\'#app\':\'.src\'};',
      { ...architecture, sourceRoot: '../src' })).toBe('missing');

    expect(runtime('export default {\'#app\':\'src/*/extra\'};',
      { ...architecture, sourceRoot: 'src/extra' })).toBe('missing');
  });
});

function bundler(
  text: string,
  scope: { sourceRoot?: string; toolRoot?: string; file?: string } = {},
) {
  return aliasConsumerEvidence(root, { ...architecture, sourceRoot: scope.sourceRoot ?? 'src' }, {
    root: scope.toolRoot ?? '',
    tsconfigs: {},
    viteConfig: { file: scope.file ?? 'vite.config.ts', text },
  })[1];
}

describe('alias consumer expression values', () => {
  it.each([
    '\'#app\': fileURLToPath(new URL(\'./src\', import.meta.url))',
    '"#app" : fileURLToPath( new  URL( "src/" ,\n import.meta.url ) )',
    '`#app`: path.resolve(__dirname, `./src`)',
    '\'#app\': resolve( __dirname , "src" )',
    'alias.set(\'#app\', fileURLToPath(new URL(\'./src\', import.meta.url)))',
    'alias.set("#app", path.resolve(__dirname, "src/"))',
  ])('verifies a target resolved from the configuration directory: %s', (text) => {
    expect(bundler(text).status).toBe('verified');
  });

  it.each([
    '\'#app\': fileURLToPath(new URL(\'./lib\', import.meta.url))',
    '\'#app\': path.resolve(__dirname, \'lib\')',
    '\'#app\': path.resolve(__dirname, \'/src\')',
    'alias.set(\'#app\', fileURLToPath(new URL(\'/src\', import.meta.url)))',
  ])('reports a resolved target that does not match: %s', (text) => {
    expect(bundler(text)).toMatchObject({ status: 'missing', aliases: ['#app'] });
  });

  it.each([
    '\'#app\': path.join(__dirname, \'src\')',
    '\'#app\': path.resolve(__dirname, \'src\', \'app\')',
    '\'#app\': path.resolve(\'src\')',
    '\'#app\': upath.resolve(__dirname, \'src\')',
    '\'#app\': fileURLToPath(new URL(\'./src\', base))',
    '\'#app\': new URL(\'./src\', import.meta.url).pathname',
  ])('keeps any other expression unverified: %s', (text) => {
    expect(bundler(text).status).toBe('unverified');
  });

  it.each([
    ['src/app', '\'#app\': path.resolve(__dirname, \'src/app/\')'],
    ['../src', '\'#app\': path.resolve(__dirname, \'../src\')'],
    ['.', '\'#app\': fileURLToPath(new URL(\'.\', import.meta.url))'],
    ['.', '\'#app\': fileURLToPath(new URL(\'./\', import.meta.url))'],
  ])('normalizes a resolved target for sourceRoot %s', (sourceRoot, text) => {
    expect(bundler(text, { sourceRoot }).status).toBe('verified');
  });

  it('resolves inside a nested toolchain rather than from the repository root', () => {
    const nested = { sourceRoot: 'web/src', toolRoot: 'web', file: 'web/vite.config.ts' };

    expect(bundler('\'#app\': path.resolve(__dirname, \'src\')', nested).status)
      .toBe('verified');

    expect(bundler('\'#app\': fileURLToPath(new URL(\'./src\', import.meta.url))', nested).status)
      .toBe('verified');

    expect(bundler('\'#app\': path.resolve(__dirname, \'web/src\')', nested).status)
      .toBe('missing');
  });

  it('resolves from the configuration file directory, not the tool root', () => {
    const scope = { file: 'config/vite.config.ts' };

    expect(bundler('\'#app\': path.resolve(__dirname, \'../src\')', scope).status)
      .toBe('verified');

    expect(bundler('\'#app\': path.resolve(__dirname, \'src\')', scope).status).toBe('missing');
    expect(bundler('\'#app\': \'src\'', scope).status).toBe('verified');
  });
});
