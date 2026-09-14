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
      .toBe('missing');
  });

  it.each([
    ['src/<rootDir>/', 'src', 'missing'],
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
      .toBe('missing');
  });

  it('retains a bridge call following a long import prefix', () => {
    expect(runtime('const prefix = \'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ\'; '
      + 'import paths from \'vite-tsconfig-paths\'; paths();'))
      .toBe('verified');
  });

  it('ignores alias declarations in multiline block comments', () => {
    expect(runtime('/* export default {\n \'#app\': \'/src\' }; */ export default {}'))
      .toBe('missing');
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
