import path from 'node:path';
import { expect, it, vi } from 'vitest';
import {
  assertTransformationAuthority, writeTransformationAuthority,
} from './transformation-authority';
import type { AuthorityGit } from './transformation-authority';
import type { LayerToModuleObligation } from './transformation-obligation';

const root = process.cwd();

const obligation: LayerToModuleObligation = {
  version: 1, direction: 'layer-first-to-module-first',
  origin: {
    head: 'start', topology: 'layer-first', applicationRoot: '.', selectedScope: 'src',
    sourceRoot: 'src', framework: 'react', router: null, sources: [],
  },
  target: { topology: 'module-first', decisions: [] },
};

function harness(value: unknown = { status: 'pending', obligation }) {
  let current = value;
  let blob: string | undefined;
  const calls: { args: string[]; input?: string }[] = [];

  const exec: AuthorityGit = (args, cwd, input) => {
    expect(cwd).toBe(root);
    calls.push({ args, input });

    if (args[0] === 'rev-parse') {
      return { status: 0, stdout: root };
    }

    if (args[0] === 'for-each-ref') {
      return { status: 0, stdout: current ? `${args[2]}\r\n` : '' };
    }

    if (args[0] === 'cat-file') {
      return { status: 0, stdout: JSON.stringify(current) };
    }

    if (args[0] === 'hash-object') {
      blob = input;

      return { status: 0, stdout: 'object-id\n' };
    }

    current = JSON.parse(blob!);

    return { status: 0, stdout: '' };
  };

  return { exec, calls, current: () => current };
}

it('records a pending Git blob, enforces its origin and retires only the same evidence', () => {
  const h = harness(null);

  writeTransformationAuthority(root, obligation, { status: 'pending', git: h.exec });
  expect(h.current()).toEqual({ status: 'pending', obligation });

  expect(h.calls.find(({ args }) => args[0] === 'hash-object')).toEqual({
    args: ['hash-object', '-w', '--stdin'],
    input: JSON.stringify({ status: 'pending', obligation }),
  });

  expect(h.calls.at(-1)?.args).toEqual([
    'update-ref', expect.stringMatching(/^refs\/blueprint\/transformations\/[a-f0-9]{64}$/),
    'object-id',
  ]);

  expect(() => assertTransformationAuthority(root, obligation, h.exec)).not.toThrow();

  expect(() => assertTransformationAuthority(root, {
    ...obligation, origin: { ...obligation.origin, head: 'tampered' },
  }, h.exec)).toThrow('origin');

  expect(() => writeTransformationAuthority(root, obligation, { status: 'pending', git: h.exec }))
    .toThrow('origin');

  writeTransformationAuthority(root, obligation, { status: 'completed', git: h.exec });
  expect(h.current()).toEqual({ status: 'completed', obligation });
  expect(() => assertTransformationAuthority(root, null, h.exec)).not.toThrow();
  expect(() => assertTransformationAuthority(root, obligation, h.exec)).not.toThrow();

  expect(() => assertTransformationAuthority(root, {
    ...obligation,
    target: {
      ...obligation.target, decisions: [{ source: 'changed', destinations: [], members: [] }],
    },
  }, h.exec)).toThrow('origin');

  writeTransformationAuthority(root, obligation, { status: 'pending', git: h.exec });
  expect(h.current()).toEqual({ status: 'pending', obligation });
});

it('allows ordinary non-Git adoption but refuses transformation records without Git', () => {
  const exec: AuthorityGit = () => ({ status: 1, stdout: '' });

  expect(() => assertTransformationAuthority(root, null, exec)).not.toThrow();
  expect(() => assertTransformationAuthority(root, obligation, exec)).toThrow('unavailable');

  expect(() => writeTransformationAuthority(root, obligation, { status: 'pending', git: exec }))
    .toThrow('unavailable');
});

it('does not accept an editable obligation without its pending authority', () => {
  const h = harness(null);

  expect(() => assertTransformationAuthority(root, null, h.exec)).not.toThrow();
  expect(() => assertTransformationAuthority(root, obligation, h.exec)).toThrow('authority');

  expect(() => writeTransformationAuthority(root, obligation, { status: 'completed', git: h.exec }))
    .toThrow('authority');
});

it.each(['for-each-ref', 'cat-file'])('fails closed when %s cannot read authority', (command) => {
  const h = harness();

  const exec: AuthorityGit = (args, cwd, input) => args[0] === command
    ? { status: 1, stdout: JSON.stringify({ status: 'pending', obligation }) }
    : h.exec(args, cwd, input);

  expect(() => assertTransformationAuthority(root, obligation, exec)).toThrow('unavailable');
});

it.each(['invalid json', 'null', '{}', '{"status":"pending"}',
  '{"status":"other","origin":{}}'])('fails closed on invalid Git authority: %s', (content) => {
  const h = harness();

  const exec: AuthorityGit = (args, cwd, input) => args[0] === 'cat-file'
    ? { status: 0, stdout: content }
    : h.exec(args, cwd, input);

  expect(() => assertTransformationAuthority(root, obligation, exec)).toThrow('unavailable');
});

it.each([
  ['hash-object', 1, 'object'], ['hash-object', 0, ''], ['update-ref', 1, ''],
] as const)('refuses failed authority write %s %s %s', (command, status, stdout) => {
  const h = harness(null);

  const exec: AuthorityGit = (args, cwd, input) => args[0] === command
    ? { status, stdout }
    : h.exec(args, cwd, input);

  expect(() => writeTransformationAuthority(root, obligation, { status: 'pending', git: exec }))
    .toThrow('authority');
});

it.each([
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['src', '25a6634263c1b1f6fc4697a04e2b9904ea4b042a89af59dc93ec1f5d44848a26'],
  ['src/project', '358db4160c5e18609188d3ece66a4b4c067169ebc2cf9659808bb5b5d998d3b2'],
])('uses repository-relative application identity for %s', (application, digest) => {
  const applicationRoot = path.join(root, application);

  const exec = vi.fn<AuthorityGit>((args) => ({
    status: 0, stdout: args[0] === 'rev-parse' ? `${root}\r\n` : '',
  }));

  assertTransformationAuthority(applicationRoot, null, exec);

  expect(exec.mock.calls).toEqual([
    [['rev-parse', '--show-toplevel'], applicationRoot],
    [['for-each-ref', '--format=%(refname)', `refs/blueprint/transformations/${digest}`],
      applicationRoot],
  ]);
});

it('does not confuse child or prefix-matching refs with the exact application authority', () => {
  const h = harness();

  const exec = vi.fn<AuthorityGit>((args, cwd, input) => args[0] === 'for-each-ref'
    ? { status: 0, stdout: `${args[2]}/child\r\n${args[2]}-other\r\n` }
    : h.exec(args, cwd, input));

  expect(() => assertTransformationAuthority(root, null, exec)).not.toThrow();
  expect(() => assertTransformationAuthority(root, obligation, exec)).toThrow('authority');
  expect(exec.mock.calls.some(([args]) => args[0] === 'cat-file')).toBe(false);
});

it('rejects an invalid authority status even when its obligation is intact', () => {
  const h = harness({ status: 'other', obligation });

  expect(() => assertTransformationAuthority(root, obligation, h.exec)).toThrow('unavailable');
  expect(() => assertTransformationAuthority(root, null, h.exec)).toThrow('unavailable');
});

it('refuses completion of changed origin before writing either a Git object or ref', () => {
  const h = harness();
  const changed = { ...obligation, origin: { ...obligation.origin, head: 'changed' } };

  expect(() => writeTransformationAuthority(root, changed, { status: 'completed', git: h.exec }))
    .toThrow('origin');

  expect(h.current()).toEqual({ status: 'pending', obligation });

  expect(h.calls.filter(({ args }) => ['hash-object', 'update-ref'].includes(args[0])))
    .toEqual([]);
});

it('stops immediately when the repository ref identity cannot be resolved', () => {
  const exec = vi.fn<AuthorityGit>(() => ({ status: 1, stdout: '' }));

  expect(() => writeTransformationAuthority(root, obligation, { status: 'pending', git: exec }))
    .toThrow('Git transformation authority is unavailable');

  expect(exec.mock.calls).toEqual([[['rev-parse', '--show-toplevel'], root]]);
});

it('refuses whitespace-only Git object identity before updating the authority ref', () => {
  const h = harness(null);

  const exec = vi.fn<AuthorityGit>((args, cwd, input) => {
    if (args[0] === 'hash-object') {
      return { status: 0, stdout: ' \r\n\t' };
    }

    return h.exec(args, cwd, input);
  });

  expect(() => writeTransformationAuthority(root, obligation, { status: 'pending', git: exec }))
    .toThrow('Git transformation authority could not be saved');

  expect(exec.mock.calls.some(([args]) => args[0] === 'update-ref')).toBe(false);
  expect(h.current()).toBeNull();
});
