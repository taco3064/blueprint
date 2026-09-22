import { describe, expect, it } from 'vitest';

import {
  renderRemoveAction,
  renderRemoveComplete,
  renderRemoveEmptyDirectory,
  renderRemovePlan,
  renderRemovePhaseFailure,
  renderRemovePostconditionFailure,
  renderRemoveRecovery,
  renderRemoveRecoveryConflict,
  renderRemoveRecoveryFailure,
  renderRemoveUninstall,
} from './remove';
import type { RemovePlanFact, RemoveReasonFact, RemoveResidueFact } from './remove';
import { renderRemoveConflicts, renderRemoveRefusal } from './remove-conflicts';
import type { RemoveConflictFact, RemoveRefusalFact } from './remove-conflicts';

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
  it('explains an unsafe phase partition without claiming lifecycle changed', () => {
    expect(renderRemovePhaseFailure())
      .toBe('Blueprint remove stopped before changing lifecycle authority because its action '
        + 'phases could not be separated safely. No dependency uninstall ran.');
  });

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

  it('lists planned actions and kept residues under their own headings', () => {
    expect(renderRemovePlan({
      ...plan,
      actions: [
        { kind: 'delete', path: 'CLAUDE.md', reason: 'generated' },
        { kind: 'ref', ref: 'refs/x', application: '.' },
      ],
      residues: [{ kind: 'modified', path: 'jsconfig.json' }],
    }).split('\n').slice(3)).toEqual([
      '  Remove:',
      '    − delete CLAUDE.md (Blueprint-generated output)',
      '    − delete Git ref refs/x (retained transformation origin for `.`)',
      '  Kept for you to review:',
      '    · jsconfig.json: Blueprint created it, but it changed since',
      '  Dependency: nothing to uninstall here',
    ]);

    expect(renderRemoveEmptyDirectory('src/pages'))
      .toBe('  ✓ remove folder src/pages (left empty by removing Blueprint files)');

    expect(renderRemoveUninstall('npm uninstall @kekkai/blueprint', 'apps/web'))
      .toBe('  → uninstall: `npm uninstall @kekkai/blueprint` in `apps/web` — last, after nothing '
        + 'left needs the package');
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
    [{ kind: 'directory-in-use', path: 'src/pages' }, 'now holds project files'],
    [{ kind: 'unrecorded', path: 'tsconfig.json', detail: 'alias' }, 'import-alias wiring'],
    [
      { kind: 'emptied', path: 'CLAUDE.md' },
      'CLAUDE.md: held only Blueprint\'s managed section and is now empty; kept because nothing '
      + 'proves Blueprint created the file — delete it if the project does not need it',
    ],
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
  it('names failed postconditions and the skipped uninstall boundary', () => {
    expect(renderRemovePostconditionFailure(['docs/a.md still exists'])).toBe([
      'Blueprint remove stopped before dependency uninstall because the requested state was not '
      + 'established:',
      '  ✗ docs/a.md still exists',
      'Nothing after this verification barrier ran. Fix the listed state and re-run '
      + '`npx blueprint remove`.',
    ].join('\n'));
  });

  it('distinguishes bounded recovery, divergent content, and failed terminal recovery', () => {
    expect(renderRemoveRecovery(['blueprint.config.mjs'])).toBe([
      'Dependency uninstall re-materialized exact copies of targets already authorized by this '
      + 'removal plan. Re-applying those actions once:',
      '  ↻ blueprint.config.mjs',
    ].join('\n'));

    const conflict = renderRemoveRecoveryConflict([
      'blueprint.config.mjs changed after dependency uninstall',
    ]);

    expect(conflict)
      .toBe([
        'Blueprint remove stopped after dependency uninstall because re-materialized targets no '
        + 'longer match the exact state this removal plan authorized:',
        '  ✗ blueprint.config.mjs changed after dependency uninstall',
        'Nothing was deleted during recovery and the plan was not widened. Review the kept content '
        + 'before deciding its ownership.',
      ].join('\n'));

    expect(renderRemoveRecoveryConflict(
      ['.blueprint-lifecycle.json changed after dependency uninstall'],
      ['blueprint.config.mjs'],
    )).toBe([
      'Blueprint remove stopped after dependency uninstall because re-materialized targets no '
      + 'longer match the exact state this removal plan authorized:',
      '  ✗ .blueprint-lifecycle.json changed after dependency uninstall',
      'Before that later conflict, recovery had already re-applied these originally authorized '
      + 'actions:',
      '  ✓ blueprint.config.mjs',
      'The divergent targets were kept and the plan was not widened. Review the kept content '
      + 'before deciding its ownership.',
    ].join('\n'));

    expect(renderRemoveRecoveryFailure(['blueprint.config.mjs still exists'])).toBe([
      'Blueprint remove could not re-establish its authorized terminal state after dependency '
      + 'uninstall:',
      '  ✗ blueprint.config.mjs still exists',
      'The bounded recovery has stopped. Restore the package before starting a new removal '
      + 'attempt.',
    ].join('\n'));
  });

  it('lists leftovers when removal is incomplete', () => {
    expect(renderRemoveComplete(['blueprint.config.mjs'])).toBe([
      'Blueprint remove incomplete — these Blueprint artifacts are still present:',
      '  ✗ blueprint.config.mjs',
      'Remove them, or re-run `npx blueprint remove` if the package is still installed.',
    ].join('\n'));
  });
});

describe('remove conflict and refusal messages', () => {
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
    [
      { kind: 'irreversible-edit', path: '.gitignore' },
      'Blueprint recorded removing text here',
    ],
  ])('explains conflict %j', (conflict, text) => {
    expect(renderRemoveConflicts([conflict])).toContain(text);
  });

  it('states what the wiring emits before asking for it to be removed', () => {
    const line = renderRemoveConflicts([{
      kind: 'reference',
      path: 'eslint.config.mjs',
      detail: 'import',
      rules: { total: 88, exclusive: 6 },
    }]);

    expect(line).toContain('emitting 88 rule(s) today');
    expect(line).toContain('6 of them Blueprint\'s own and unrebuildable');
    expect(line).toContain('lint stays green after you remove it, because the rules left with it');
  });

  it('asks for the wiring without a count when no config resolves', () => {
    const line = renderRemoveConflicts([
      { kind: 'reference', path: 'eslint.config.mjs', detail: 'import' },
    ]);

    expect(line).toContain('remove its Blueprint wiring');
    expect(line).not.toContain('rule(s) today');
  });

  it.each<[RemoveRefusalFact, string]>([
    [{ kind: 'not-adopted', root: '/repo' }, 'no adopted application was found at or below /repo'],
    [
      { kind: 'missing-state', file: '.blueprint-lifecycle.json', installed: '4.1.0' },
      'Blueprint does not rebuild the records',
    ],
    [
      {
        kind: 'pending-upgrade', file: '.blueprint-lifecycle.json', applications: ['apps/admin'],
      },
      'records an upgrade in progress, and apps/admin stay adopted',
    ],
  ])('refuses %j', (fact, fragment) => {
    expect(renderRemoveRefusal(fact)).toContain(fragment);
  });
});
