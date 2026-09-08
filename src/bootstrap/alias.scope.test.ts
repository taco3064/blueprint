import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ArchitectureDef } from '../config';
import { detect } from '../project';
import { aliasActions } from './alias';
import type { Action } from './types';

const architecture = {
  alias: '~app',
  layers: [{ name: 'components', does: 'UI' }],
} satisfies ArchitectureDef;

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-nested-alias-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(file: string, content: string): void {
  const full = path.join(root, file);

  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function instructions(actions: Action[]): string {
  return actions
    .filter((action) => action.kind === 'instruct')
    .map((action) => action.note)
    .join('\n');
}

describe('aliasActions · nested application toolchain', () => {
  it('does not patch a solution config when its referenced app already owns the alias', () => {
    write('tsconfig.json', JSON.stringify({
      files: [],
      references: [{ path: './config/ts/tsconfig.app.json' }],
    }));

    write('config/ts/tsconfig.app.json', JSON.stringify({
      compilerOptions: { baseUrl: '../..', paths: { '@/*': ['./*'] } },
      include: ['../../app', '../../features'],
    }));

    const actions = aliasActions(detect(root), {
      ...architecture,
      alias: '@',
      sourceRoot: '.',
    });

    expect(actions.some((action) => action.kind === 'write' && action.path.endsWith('.json')))
      .toBe(false);
  });

  it('falls back to the solution config when its reference cannot be read', () => {
    write('tsconfig.json', JSON.stringify({
      files: [],
      references: [{ path: './config/ts/missing.json' }],
    }));

    const actions = aliasActions(detect(root), architecture);

    expect(actions.some((action) => action.kind === 'write' && action.path === 'tsconfig.json'))
      .toBe(true);
  });

  it('patches a readable referenced config instead of the solution config', () => {
    write('tsconfig.json', JSON.stringify({
      files: [],
      references: [{ path: './config/ts/tsconfig.app.json' }],
    }));

    write('config/ts/tsconfig.app.json', JSON.stringify({ compilerOptions: {} }));

    const actions = aliasActions(detect(root), architecture);

    expect(actions.some((action) => action.kind === 'write'
      && action.path === 'config/ts/tsconfig.app.json')).toBe(true);

    expect(actions.some((action) => action.kind === 'write' && action.path === 'tsconfig.json'))
      .toBe(false);
  });

  it('uses the application tsconfig and names its delegated Vite config', () => {
    write('tsconfig.json', JSON.stringify({ compilerOptions: {} }));

    write('apps/web-antd/tsconfig.json', JSON.stringify({
      compilerOptions: { paths: { '#/*': ['./src/*'] } },
    }));

    write('apps/web-antd/vite.config.ts', 'export { default } from "../../vite.config";');

    const actions = aliasActions(detect(root), {
      ...architecture,
      alias: '#',
      sourceRoot: 'apps/web-antd/src',
    });

    expect(actions.some((action) => action.kind === 'write' && action.path === 'tsconfig.json'))
      .toBe(false);

    expect(instructions(actions)).toContain('apps/web-antd/vite.config.ts');
    expect(instructions(actions)).toContain('delegates to workspace Vite configuration');
  });

  it('creates a nested jsconfig relative to the application root', () => {
    write('apps/web/package.json', '{}');

    const actions = aliasActions(detect(root), {
      ...architecture,
      sourceRoot: 'apps/web',
    });

    const config = actions.find(
      (action) => action.kind === 'write' && action.path === 'apps/web/jsconfig.json',
    );

    expect(JSON.parse(config?.kind === 'write' ? config.content : '')).toEqual({
      compilerOptions: { paths: { '~app/*': ['./*'] } },
    });
  });
});
