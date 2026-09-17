import { describe, expect, it } from 'vitest';

import { renderRemoveAction, renderRemoveComplete, renderRemovePlan } from './remove';
import type { RemovePlanFact, RemoveReasonFact, RemoveResidueFact } from './remove';
import { renderRemoveConflicts, renderRemoveRefusal } from './remove-conflicts';
import type { RemoveConflictFact } from './remove-conflicts';

const plan: RemovePlanFact = {
  dryRun: false,
  mode: 'provenance',
  applications: ['.'],
  remaining: [],
  actions: [],
  residues: [],
  uninstall: [],
};

describe('remove plan report', () => {
  it('states an empty plan honestly', () => {
    expect(renderRemovePlan(plan).split('\n')).toEqual([
      'Blueprint remove — plan',
      '  Scope: `.` — the whole repository',
      '  Ownership evidence: lifecycle records prove every Blueprint-owned file and shared-file '
      + 'edit',
      '  Remove: nothing Blueprint-owned remains',
      '  Dependency: nothing to uninstall here',
    ]);
  });

  it.each<[RemoveReasonFact, string]>([
    ['config', 'Blueprint architecture config'],
    ['lifecycle-state', 'Blueprint lifecycle state'],
    ['baseline', 'Blueprint inspect baseline'],
    ['workflow', 'unfinished Blueprint workflow artifact'],
    ['reference', 'Blueprint merge reference'],
    ['backup', 'Blueprint 3.2 config backup'],
    ['generated', 'Blueprint-generated output'],
    ['created', 'created by Blueprint and unchanged since'],
    ['section', 'Blueprint-managed section; content outside the markers is kept'],
    ['edit', 'reverses the exact recorded Blueprint edit'],
    ['script', 'restores the package script Blueprint changed'],
    ['gitignore', 'removes Blueprint\'s marked ignore exceptions'],
    ['directory', 'empty layer folder Blueprint created'],
  ])('explains the %s reason', (reason, text) => {
    expect(renderRemoveAction({ kind: 'delete', path: 'x', reason }, 'applied'))
      .toBe(`  ✓ delete x (${text})`);
  });

  it('names each action verb and the Git ref it deletes', () => {
    expect(renderRemoveAction({ kind: 'write', path: 'a', reason: 'edit' }, 'dry-run'))
      .toBe('  would rewrite a (reverses the exact recorded Blueprint edit)');

    expect(renderRemoveAction({ kind: 'rmdir', path: 'src/pages', reason: 'directory' }, 'applied'))
      .toBe('  ✓ remove folder src/pages (empty layer folder Blueprint created)');

    expect(renderRemoveAction({ kind: 'ref', ref: 'refs/x', application: 'apps/web' }, 'dry-run'))
      .toBe('  would delete Git ref refs/x (retained transformation origin for `apps/web`)');
  });

  it.each<[RemoveResidueFact, string]>([
    [{ kind: 'required-by-source', path: 'vite.config.ts', alias: '~app' }, 'still imports `~app`'],
    [{ kind: 'irreversible', path: 'a' }, 'cannot be located for reversal'],
    [{ kind: 'directory-in-use', path: 'src/pages' }, 'now holds project files'],
    [{ kind: 'unrecorded', path: 'tsconfig.json', detail: 'alias' }, 'import-alias wiring'],
  ])('explains residue %j', (residue, text) => {
    expect(renderRemovePlan({ ...plan, residues: [residue] })).toContain(text);
  });

  it('marks dry runs and uninstall steps', () => {
    const text = renderRemovePlan({
      ...plan,
      dryRun: true,
      mode: 'legacy',
      remaining: ['apps/admin'],
      uninstall: [{ manifest: 'apps/web', command: 'pnpm remove @kekkai/blueprint' }],
    });

    expect(text).toContain('Blueprint remove — dry run (nothing was changed)');
    expect(text).toContain('Scope: `.`; still adopted and kept: `apps/admin`');

    expect(text).toContain('Dependency, removed last: `pnpm remove @kekkai/blueprint` '
      + 'in `apps/web`');

    expect(text).toContain('Next: re-run without --dry-run to apply this plan.');
  });
});

describe('remove outcome messages', () => {
  it('lists leftovers when removal is incomplete', () => {
    expect(renderRemoveComplete(['blueprint.config.mjs'])).toBe([
      'Blueprint remove incomplete — these Blueprint artifacts are still present:',
      '  ✗ blueprint.config.mjs',
      'Remove them, or re-run `npx blueprint remove` if the package is still installed.',
    ].join('\n'));
  });

  it.each<[RemoveConflictFact, string]>([
    [
      {
        kind: 'diverged-script', path: 'package.json', name: 'lint',
        expected: 'eslint src', current: null,
      },
      'scripts.lint is missing or not text',
    ],
    [
      { kind: 'reference', path: 'x.config.ts', detail: 'config-path' },
      'still loads a blueprint.config.mjs',
    ],
  ])('explains conflict %j', (conflict, text) => {
    expect(renderRemoveConflicts([conflict])).toContain(text);
  });

  it('refuses without an adopted scope', () => {
    expect(renderRemoveRefusal({ kind: 'not-adopted', root: '/repo' }))
      .toContain('no adopted application was found at or below /repo');
  });
});
