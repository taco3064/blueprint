import { expect, it } from 'vitest';
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
    ? { status: 1, stdout: '' }
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
