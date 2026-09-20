import { expect, it, vi } from 'vitest';
import {
  recoverTransformationObligation, retainedTransformationOrigin, writeTransformationAuthorities,
} from './transformation-authority';
import type { AuthorityGit } from './transformation-authority';
import type { LayerToModuleObligation } from './transformation-obligation';

const root = process.cwd();

function obligation(): LayerToModuleObligation {
  return {
    version: 1, direction: 'layer-first-to-module-first',
    origin: {
      head: 'origin', topology: 'layer-first', applicationRoot: '.', selectedScope: 'src',
      sourceRoot: 'src', framework: 'react', router: null,
      sources: [{ role: 'route-composition', unit: 'pages/Home', members: ['src/pages/Home.ts'] }],
    },
    target: { topology: 'module-first', decisions: [] },
  };
}

function harness(value: unknown = { status: 'pending', obligation: obligation() }) {
  return vi.fn<AuthorityGit>((args) => {
    if (args[0] === 'rev-parse') {
      return { status: 0, stdout: args[1] === 'HEAD' ? 'origin\r\n' : `${root}\r\n` };
    }

    if (args[0] === 'for-each-ref') {
      return { status: 0, stdout: value ? args[2] : '' };
    }

    if (args[0] === 'cat-file') {
      return { status: 0, stdout: JSON.stringify(value) };
    }

    return { status: 0, stdout: 'blob-id\n' };
  });
}

it('recovers the validated retained obligation without any write', () => {
  const exec = harness();

  expect(recoverTransformationObligation(root, exec)).toEqual(obligation());

  expect(exec.mock.calls.map(([args]) => args[0]))
    .toEqual(['rev-parse', 'for-each-ref', 'cat-file', 'rev-parse', 'rev-parse']);
});

it.each([null, { status: 'completed', obligation: obligation() }])(
  'refuses recovery without a pending authority: %j', (value) => {
    expect(() => recoverTransformationObligation(root, harness(value)))
      .toThrow('No pending Git transformation authority');
  },
);

it('refuses recovery when repository identity cannot be read', () => {
  const exec = vi.fn<AuthorityGit>(() => ({ status: 1, stdout: '' }));

  expect(() => recoverTransformationObligation(root, exec)).toThrow('authority is unavailable');
  expect(exec).toHaveBeenCalledOnce();
});

it.each([
  ['repository', 1, root], ['head', 1, 'origin'], ['head', 0, 'different'],
] as const)('refuses recovery for changed or unreadable %s', (part, status, stdout) => {
  const normal = harness();
  let repositoryReads = 0;

  const exec: AuthorityGit = (args, cwd, input) => {
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
      repositoryReads += 1;
    }

    return (part === 'repository' && repositoryReads === 2 && args[1] === '--show-toplevel')
      || (part === 'head' && args[1] === 'HEAD')
      ? { status, stdout }
      : normal(args, cwd, input);
  };

  expect(() => recoverTransformationObligation(root, exec)).toThrow('recorded origin HEAD');
});

it.each(['/outside', 'C:/outside', 'C:outside', 'C:\\outside', '../outside', 'nested/../outside',
  'src\\outside'])('refuses unsafe retained source scope %s', (scope) => {
  const recorded = obligation();

  recorded.origin.sourceRoot = scope;

  const exec = harness({ status: 'pending', obligation: recorded });

  expect(() => recoverTransformationObligation(root, exec))
    .toThrow('unsafe or mismatched');
});

it('refuses a retained obligation belonging to another application', () => {
  const recorded = obligation();

  recorded.origin.applicationRoot = 'apps/other';

  const exec = harness({ status: 'pending', obligation: recorded });

  expect(() => recoverTransformationObligation(root, exec))
    .toThrow('unsafe or mismatched');
});

it('prepares all blobs before one atomic Git transaction', () => {
  const exec = harness(null);
  const recorded = obligation();

  writeTransformationAuthorities(root, [{ root, obligation: recorded }], exec);

  const writes = exec.mock.calls.filter(([args]) =>
    ['hash-object', 'update-ref'].includes(args[0]));

  expect(writes).toEqual([
    [['hash-object', '-w', '--stdin'], root,
      JSON.stringify({ status: 'pending', obligation: recorded })],
    [['update-ref', '--stdin'], root,
      expect.stringMatching(/^start\nupdate refs\/blueprint\/transformations\/[a-f0-9]+ blob-id\nprepare\ncommit\n$/)],
  ]);
});

it.each([
  ['rev-parse', 1, ''], ['hash-object', 1, 'blob'], ['hash-object', 0, ' \r\n'],
  ['update-ref', 1, ''],
] as const)('refuses failed batch %s before reporting registration', (command, status, stdout) => {
  const normal = harness(null);

  const exec = vi.fn<AuthorityGit>((args, cwd, input) => args[0] === command
    ? { status, stdout }
    : normal(args, cwd, input));

  expect(() => writeTransformationAuthorities(root, [{ root, obligation: obligation() }], exec))
    .toThrow('Git transformation authority');

  if (command !== 'update-ref') {
    expect(exec.mock.calls.some(([args]) => args[0] === 'update-ref')).toBe(false);
  }
});

it('preserves an existing pending authority when batch registration is retried', () => {
  const exec = harness();

  expect(() => writeTransformationAuthorities(root, [{ root, obligation: obligation() }], exec))
    .toThrow('retained Git transformation authority');

  expect(exec.mock.calls.some(([args]) => ['hash-object', 'update-ref'].includes(args[0])))
    .toBe(false);
});

it('refuses empty retained member paths before recovery', () => {
  const recorded = obligation();

  recorded.origin.sources[0].members = [''];
  const exec = harness({ status: 'pending', obligation: recorded });

  expect(() => recoverTransformationObligation(root, exec))
    .toThrow('unsafe or mismatched');
});

it('returns the retained origin only once the authority is completed', () => {
  expect(retainedTransformationOrigin(root, harness({
    status: 'completed', obligation: obligation(),
  }))).toEqual(obligation());
});

it.each([
  ['a pending authority', harness()],
  ['no recorded authority', harness(null)],
  ['an unreadable repository', vi.fn<AuthorityGit>(() => ({ status: 1, stdout: '' }))],
] as const)('retains no origin from %s', (_case, exec) => {
  expect(retainedTransformationOrigin(root, exec)).toBeNull();
});
