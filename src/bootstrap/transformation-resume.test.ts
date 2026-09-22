import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  detect, TRANSFORMATION_OBLIGATION_FILE, writeTransformationAuthority,
  assertTransformationAuthority, readTransformationObligation,
} from '../project';
import { renderTransformationRetireNote } from '../operational-contract';
import * as inspect from '../inspect';
import * as project from '../project';
import {
  completeTransformationRetirement, transformationRetirement,
} from './transformation-resume';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-retirement-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

function record(): string {
  const content = JSON.stringify({
    version: 1,
    direction: 'layer-first-to-module-first',
    origin: {
      head: 'origin', topology: 'layer-first', applicationRoot: '.', selectedScope: 'src',
      sourceRoot: 'src', framework: 'react', router: null,
      sources: [{
        role: 'route-composition', unit: 'pages/Home', members: ['src/pages/Home.ts'],
      }],
    },
    target: { topology: 'module-first', decisions: [] },
  });

  fs.writeFileSync(path.join(root, TRANSFORMATION_OBLIGATION_FILE), content);
  expect(spawnSync('git', ['init', '--quiet'], { cwd: root }).status).toBe(0);
  writeTransformationAuthority(root, JSON.parse(content), { status: 'pending' });

  return content;
}

describe('transformation retirement prerequisites', () => {
  it('leaves ordinary adoption without an obligation unchanged', () => {
    expect(transformationRetirement({ root, state: detect(root), blueprint: null })).toBeNull();
  });

  it.each([
    [true, 'Explicit re-authoring does not complete'],
    [false, 'has no current config to verify'],
  ])('refuses without deleting recorded authority (authoring=%s)', (authoring, message) => {
    const content = record();

    expect(() => transformationRetirement({
      root, state: detect(root), blueprint: null, authoring,
    })).toThrow(message);

    expect(fs.readFileSync(path.join(root, TRANSFORMATION_OBLIGATION_FILE), 'utf8'))
      .toBe(content);
  });
});

it('retires only artifacts that exist, after verification', () => {
  record();

  const verify = vi.spyOn(inspect, 'verifyTransformationObligation')
    .mockReturnValue({ ok: true, failures: [] });

  const actions = transformationRetirement({
    root, state: detect(root),
    blueprint: { framework: 'react', architecture: { alias: '~app', layers: [] } },
    requestedTopology: 'module-first',
  });

  expect(verify).toHaveBeenCalledExactlyOnceWith({
    root, state: detect(root),
    blueprint: { framework: 'react', architecture: { alias: '~app', layers: [] } },
    obligation: readTransformationObligation(root),
  });

  expect(actions).toEqual([{
    kind: 'rm', path: TRANSFORMATION_OBLIGATION_FILE,
    note: `${TRANSFORMATION_OBLIGATION_FILE} (verified transformation obligation retired)`,
  }]);
});

it('completes only after a successful non-dry-run scaffold', async () => {
  record();
  const obligation = readTransformationObligation(root)!;
  const apply = vi.fn().mockResolvedValue([]);

  expect(await completeTransformationRetirement(root, {
    retirement: [], dryRun: true, log: () => {},
  }, apply)).toEqual([]);

  expect(() => assertTransformationAuthority(root, obligation)).not.toThrow();
  expect(() => assertTransformationAuthority(root, null)).toThrow();
  const failure = new Error('scaffold failed');

  await expect(completeTransformationRetirement(root, { retirement: [], log: () => {} },
    () => Promise.reject(failure)))
    .rejects.toBe(failure);

  expect(() => assertTransformationAuthority(root, obligation)).not.toThrow();

  expect(await completeTransformationRetirement(root, {
    retirement: [], log: () => {},
  }, apply)).toEqual([{
    kind: 'rm', path: TRANSFORMATION_OBLIGATION_FILE,
    note: renderTransformationRetireNote(TRANSFORMATION_OBLIGATION_FILE),
  }]);

  expect(() => assertTransformationAuthority(root, null)).not.toThrow();
  expect(() => assertTransformationAuthority(root, obligation)).not.toThrow();
});

it('cleans playbooks before completing authority and removes the obligation last', async () => {
  const content = record();
  const obligation = readTransformationObligation(root)!;

  const retirement = [
    project.AUTHORING_FILE, project.COMMAND_FILE, TRANSFORMATION_OBLIGATION_FILE,
  ].map((file) => ({
    kind: 'rm' as const, path: file, note: renderTransformationRetireNote(file),
  }));

  fs.writeFileSync(path.join(root, project.AUTHORING_FILE), 'playbook');
  fs.mkdirSync(path.dirname(path.join(root, project.COMMAND_FILE)), { recursive: true });
  fs.writeFileSync(path.join(root, project.COMMAND_FILE), 'command');

  const scaffold = vi.fn(async (trailing) => {
    expect(trailing).toEqual(retirement.slice(0, 2));

    expect(fs.readFileSync(path.join(root, TRANSFORMATION_OBLIGATION_FILE), 'utf8'))
      .toBe(content);

    expect(() => assertTransformationAuthority(root, null)).toThrow();
    fs.rmSync(path.join(root, project.AUTHORING_FILE));
    fs.rmSync(path.join(root, project.COMMAND_FILE));

    return trailing;
  });

  expect(await completeTransformationRetirement(root, {
    retirement, log: () => {},
  }, scaffold)).toEqual(retirement);

  expect(scaffold).toHaveBeenCalledOnce();
  expect(fs.existsSync(path.join(root, TRANSFORMATION_OBLIGATION_FILE))).toBe(false);
  expect(fs.existsSync(path.join(root, project.AUTHORING_FILE))).toBe(false);
  expect(fs.existsSync(path.join(root, project.COMMAND_FILE))).toBe(false);
  expect(() => assertTransformationAuthority(root, null)).not.toThrow();
  expect(() => assertTransformationAuthority(root, obligation)).not.toThrow();
});

it('preserves editable decisions when scaffold or authority completion fails', async () => {
  const content = record();
  const failure = new Error('ref update failed');

  const write = vi.spyOn(project, 'writeTransformationAuthority').mockImplementation(() => {
    throw failure;
  });

  const retirement = [{
    kind: 'rm' as const, path: TRANSFORMATION_OBLIGATION_FILE,
    note: renderTransformationRetireNote(TRANSFORMATION_OBLIGATION_FILE),
  }];

  const scaffold = vi.fn().mockResolvedValue([]);

  await expect(completeTransformationRetirement(root, {
    retirement, log: () => {},
  }, scaffold)).rejects.toBe(failure);

  expect(scaffold).toHaveBeenCalledExactlyOnceWith([]);
  expect(fs.readFileSync(path.join(root, TRANSFORMATION_OBLIGATION_FILE), 'utf8')).toBe(content);
  expect(write).toHaveBeenCalledOnce();
});

it('retries JSON cleanup using completed authority without losing its decisions', async () => {
  const content = record();
  const obligation = readTransformationObligation(root)!;

  const retirement = [{
    kind: 'rm' as const, path: TRANSFORMATION_OBLIGATION_FILE,
    note: renderTransformationRetireNote(TRANSFORMATION_OBLIGATION_FILE),
  }];

  const failure = new Error('cleanup failed');

  const remove = vi.spyOn(fs, 'rmSync').mockImplementationOnce(() => {
    throw failure;
  });

  const scaffold = vi.fn().mockResolvedValue([]);

  await expect(completeTransformationRetirement(root, {
    retirement, log: () => {},
  }, scaffold)).rejects.toBe(failure);

  expect(fs.readFileSync(path.join(root, TRANSFORMATION_OBLIGATION_FILE), 'utf8')).toBe(content);
  expect(() => assertTransformationAuthority(root, obligation)).not.toThrow();
  expect(() => assertTransformationAuthority(root, null)).toThrow();
  remove.mockRestore();
  const log = vi.fn();

  expect(await completeTransformationRetirement(root, { retirement, log }, scaffold))
    .toEqual(retirement);

  expect(fs.existsSync(path.join(root, TRANSFORMATION_OBLIGATION_FILE))).toBe(false);
  expect(log).toHaveBeenCalledOnce();
});

it('does not complete authority when obligation removal returns without deleting', async () => {
  const content = record();
  const obligation = readTransformationObligation(root)!;

  const retirement = [{
    kind: 'rm' as const, path: TRANSFORMATION_OBLIGATION_FILE,
    note: renderTransformationRetireNote(TRANSFORMATION_OBLIGATION_FILE),
  }];

  const remove = vi.spyOn(fs, 'rmSync').mockImplementationOnce(() => {});
  const log = vi.fn();

  await expect(completeTransformationRetirement(
    root,
    { retirement, log },
    vi.fn().mockResolvedValue([]),
  )).rejects.toThrow(`${TRANSFORMATION_OBLIGATION_FILE} still exists`);

  expect(fs.readFileSync(path.join(root, TRANSFORMATION_OBLIGATION_FILE), 'utf8')).toBe(content);
  expect(() => assertTransformationAuthority(root, obligation)).not.toThrow();
  expect(() => assertTransformationAuthority(root, null)).toThrow();
  expect(log).not.toHaveBeenCalled();
  remove.mockRestore();
});

it.each([
  project.AUTHORING_FILE,
  project.COMMAND_FILE,
])('does not complete authority while %s remains', async (file) => {
  record();
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), 'playbook');

  await expect(completeTransformationRetirement(root, {
    retirement: [], log: () => {},
  }, vi.fn().mockResolvedValue([]))).rejects.toThrow(`${file} still exists`);

  expect(() => assertTransformationAuthority(root, null)).toThrow();
  expect(fs.existsSync(path.join(root, TRANSFORMATION_OBLIGATION_FILE))).toBe(true);
  expect(fs.existsSync(path.join(root, file))).toBe(true);
});
