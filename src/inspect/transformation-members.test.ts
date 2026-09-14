import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayerToModuleObligation } from '../project';
import { memberFailures } from './transformation-members';

const roots: string[] = [];

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'member-proof-'));

  roots.push(root);

  fs.writeFileSync(
    path.join(root, 'destination.ts'), 'import \'./moved\';\nexport const value = 1;\n');

  const obligation: LayerToModuleObligation = {
    version: 1, direction: 'layer-first-to-module-first',
    origin: {
      head: 'abc', topology: 'layer-first', applicationRoot: 'apps/web',
      selectedScope: 'src', sourceRoot: 'src', framework: 'react', router: null,
      sources: [{ role: 'container-seed', unit: 'containers', members: ['src/containers/A.ts'] }],
    },
    target: {
      topology: 'module-first', decisions: [{
        source: 'containers', destinations: ['destination.ts'],
        members: [{ source: 'src/containers/A.ts', destination: 'destination.ts' }],
      }],
    },
  };

  return {
    root, repositoryRoot: root, obligation,
    git: (args: string[], cwd: string) => {
      if (args[0] === 'ls-tree') {
        return { status: 0, stdout: '', stderr: '' };
      }

      expect(args).toEqual(['show', 'abc:apps/web/src/containers/A.ts']);
      expect(cwd).toBe(root);

      return { status: 0, stdout: 'import \'./original\';\nexport const value = 1;\n', stderr: '' };
    },
  };
}

afterEach(() => {
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

describe('member provenance', () => {
  it('proves each moved member while permitting module specifier rewrites', () => {
    expect(memberFailures(fixture())).toEqual([]);
  });

  it.each([
    ['unrelated content', 'export const unrelated = 1;'],
    ['changed implementation', 'import \'./moved\';\nexport const value = 2;\n'],
    ['invalid destination syntax', 'export const = ;'],
  ])('rejects %s with source and destination evidence', (_, content) => {
    const context = fixture();

    fs.writeFileSync(path.join(context.root, 'destination.ts'), content);

    expect(memberFailures(context)).toEqual([{
      code: 'member-identity-unproven', subject: 'src/containers/A.ts',
      expected: 'destination.ts',
    }]);
  });

  it('rejects deletion with a missing destination', () => {
    const context = fixture();

    fs.unlinkSync(path.join(context.root, 'destination.ts'));

    expect(memberFailures(context)).toContainEqual({
      code: 'member-identity-unproven', subject: 'src/containers/A.ts',
      expected: 'destination.ts',
    });
  });

  it('rejects unavailable or unparsable origin blobs', () => {
    for (const [status, stdout] of [[1, ''], [0, 'export const = ;']] as const) {
      const context = fixture();

      expect(memberFailures({ ...context, git: () => ({ status, stdout, stderr: '' }) }))
        .toContainEqual({ code: 'member-identity-unproven',
          subject: 'src/containers/A.ts', expected: 'destination.ts',
        });
    }
  });

  it.each([
    { members: [], destinations: ['destination.ts'] },
    { members: [{ source: 'src/containers/A.ts', destination: 'destination.ts' }],
      destinations: [] },
    { members: [{ source: 'src/containers/A.ts', destination: 'destination.ts' }],
      destinations: ['other'] },
    { members: [{ source: 'unknown', destination: 'destination.ts' }],
      destinations: ['destination.ts'] },
  ])('rejects incomplete member evidence', (patch) => {
    const context = fixture();

    Object.assign(context.obligation.target.decisions[0], patch);

    expect(memberFailures(context))
      .toContainEqual({ code: 'member-mapping-incomplete', subject: 'containers' });
  });

  it('rejects multiple source members claiming the same existing destination', () => {
    const context = fixture();
    const decision = context.obligation.target.decisions[0];

    context.obligation.origin.sources[0].members.push('src/containers/B.ts');
    decision.members.push({ source: 'src/containers/B.ts', destination: 'destination.ts' });
    decision.destinations.push('destination.ts');

    expect(memberFailures({ ...context, git: (args) => ({
      status: 0,
      stdout: args[0] === 'ls-tree' ? '' : 'import \'./original\';\nexport const value = 1;\n',
      stderr: '',
    }) })).toEqual([{ code: 'member-destination-reused', subject: 'destination.ts' }]);
  });
});

describe('member authority boundaries', () => {
  it.each([
    { status: 0, stdout: 'apps/web/destination.ts\n' },
    { status: 1, stdout: '' },
  ])('rejects preexisting destinations and unavailable origin inventory', (result) => {
    const context = fixture();
    const originalGit = context.git;

    expect(memberFailures({ ...context, git: (args, cwd) => args[0] === 'ls-tree'
      ? { ...result, stderr: '' }
      : originalGit(args, cwd) })).toEqual([{
      code: 'member-identity-unproven', subject: 'src/containers/A.ts',
      expected: 'destination.ts',
    }]);
  });

  it.each(['../outside.ts', '/absolute.ts', 'C:drive.ts', 'nested\\file.ts', ''])(
    'rejects unsafe destination %s before reading Git content', (destination) => {
      const context = fixture();

      context.obligation.target.decisions[0].members[0].destination = destination;
      context.obligation.target.decisions[0].destinations = [destination];

      expect(memberFailures({ ...context, git: () => {
        throw new Error('must not read');
      } }))
        .toEqual([{
          code: 'member-identity-unproven', subject: 'src/containers/A.ts', expected: destination,
        }]);
    },
  );

  it('rejects a decision for a unit absent from the origin', () => {
    const context = fixture();

    context.obligation.target.decisions[0].source = 'unknown';

    expect(memberFailures(context)).toEqual([
      { code: 'member-mapping-incomplete', subject: 'unknown' },
      {
        code: 'member-identity-unproven', subject: 'src/containers/A.ts',
        expected: 'destination.ts',
      },
    ]);
  });

  it('rejects duplicate source mappings even with distinct destinations', () => {
    const context = fixture();
    const decision = context.obligation.target.decisions[0];

    context.obligation.origin.sources[0].members.push('src/containers/B.ts');
    decision.members.push({ source: 'src/containers/A.ts', destination: 'second.ts' });
    decision.destinations.push('second.ts');

    fs.copyFileSync(
      path.join(context.root, 'destination.ts'), path.join(context.root, 'second.ts'),
    );

    expect(memberFailures(context))
      .toEqual([{ code: 'member-mapping-incomplete', subject: 'containers' }]);
  });

  it.each(['txt', 'vue', 'js', 'tsx', 'mjs', 'cjs'])(
    'rejects a move that changes the source execution kind to %s', (extension) => {
      const context = fixture();
      const destination = `destination.${extension}`;

      fs.renameSync(
        path.join(context.root, 'destination.ts'), path.join(context.root, destination),
      );

      context.obligation.target.decisions[0].members[0].destination = destination;
      context.obligation.target.decisions[0].destinations = [destination];

      expect(memberFailures(context)).toEqual([{
        code: 'member-identity-unproven', subject: 'src/containers/A.ts', expected: destination,
      }]);
    },
  );
});

describe('member proof fail-closed controls', () => {
  it('rejects failed Git reads even when stdout matches the destination', () => {
    const context = fixture();

    expect(memberFailures({ ...context, git: (args) => ({
      status: args[0] === 'show' ? 1 : 0,
      stdout: args[0] === 'show' ? 'import \'./original\';\nexport const value = 1;\n' : '',
      stderr: '',
    }) })).toEqual([{
      code: 'member-identity-unproven', subject: 'src/containers/A.ts', expected: 'destination.ts',
    }]);
  });

  it('never treats two unparsable source bodies as matching identities', () => {
    const context = fixture();

    fs.writeFileSync(path.join(context.root, 'destination.ts'), 'export const = ;');

    expect(memberFailures({ ...context, git: (args) => ({
      status: 0, stdout: args[0] === 'show' ? 'export const = ;' : '', stderr: '',
    }) })).toEqual([{
      code: 'member-identity-unproven', subject: 'src/containers/A.ts', expected: 'destination.ts',
    }]);
  });

  it('accepts a destination containing a non-leading colon without treating it as a drive', () => {
    const context = fixture();
    const destination = 'nested/name:variant.ts';
    const target = path.resolve(context.root, destination);
    const decision = context.obligation.target.decisions[0];

    decision.destinations = [destination];
    decision.members[0].destination = destination;

    const reader = vi.spyOn(fs, 'readFileSync')
      .mockReturnValue('import \'./moved\';\nexport const value = 1;\n');

    try {
      expect(memberFailures(context)).toEqual([]);
      expect(reader).toHaveBeenCalledWith(target, 'utf8');
    } finally {
      reader.mockRestore();
    }
  });

  it('normalizes whitespace-only empty Git inventory output', () => {
    const context = fixture();
    const reader = context.git;

    expect(memberFailures({ ...context, git: (args, cwd) => args[0] === 'ls-tree'
      ? { status: 0, stdout: ' \r\n\t', stderr: '' }
      : reader(args, cwd) })).toEqual([]);
  });
});

describe('member mapping collection controls', () => {
  it('does not emit member findings or read Git outside a safe origin scope', () => {
    const context = fixture();

    context.obligation.origin.applicationRoot = '..';

    expect(memberFailures({ ...context, git: () => {
      throw new Error('must not read');
    } })).toEqual([]);
  });

  it('leaves an empty unknown-unit decision to the separate unit authority check', () => {
    const context = fixture();

    context.obligation.target.decisions = [{ source: 'unknown', members: [], destinations: [] }];
    expect(memberFailures(context)).toEqual([]);
  });

  it('rejects surplus destinations without member evidence', () => {
    const context = fixture();

    context.obligation.target.decisions[0].destinations.push('extra.ts');

    expect(memberFailures(context))
      .toEqual([{ code: 'member-mapping-incomplete', subject: 'containers' }]);
  });

  it.each(['mixed-duplicates', 'mixed-destinations'])(
    'rejects partial mapping coverage with %s', (variant) => {
      const context = fixture();
      const decision = context.obligation.target.decisions[0];

      context.obligation.origin.sources[0].members = ['src/containers/A.ts', 'src/containers/B.ts'];
      decision.members.push({ source: 'src/containers/B.ts', destination: 'second.ts' });
      decision.destinations.push('second.ts');

      fs.copyFileSync(
        path.join(context.root, 'destination.ts'), path.join(context.root, 'second.ts'),
      );

      if (variant === 'mixed-duplicates') {
        context.obligation.origin.sources[0].members.push('src/containers/C.ts');
        decision.members.push({ source: 'src/containers/B.ts', destination: 'third.ts' });
        decision.destinations.push('third.ts');

        fs.copyFileSync(
          path.join(context.root, 'destination.ts'), path.join(context.root, 'third.ts'),
        );
      } else {
        decision.destinations[1] = 'third.ts';
      }

      expect(memberFailures({ ...context, git: (args) => ({
        status: 0,
        stdout: args[0] === 'show' ? 'import \'./original\';\nexport const value = 1;\n' : '',
        stderr: '',
      }) })).toEqual([{ code: 'member-mapping-incomplete', subject: 'containers' }]);
    },
  );
});
