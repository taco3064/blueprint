import { describe, expect, it } from 'vitest';

import {
  renderUpgradeHandoff,
  renderUpgradeInstallStarting,
  renderUpgradeOperationCompleted,
  renderUpgradePlan,
  renderUpgradeReconcile,
  renderUpgradeStateRecorded,
  renderUpgradeVerificationPending,
  renderUpgradeVerificationResult,
} from './upgrade';
import type { UpgradePlanFact } from './upgrade';
import {
  renderUpgradeInstruction,
  renderUpgradeVerification,
  UPGRADE_INSTRUCTION_IDS,
} from './upgrade-instructions';
import { renderUpgradePlaybook } from './upgrade-playbook';
import { renderUpgradeRefusal } from './upgrade-refusals';
import type { UpgradeRefusalFact } from './upgrade-refusals';

const plan: UpgradePlanFact = {
  dryRun: false,
  mode: 'start',
  source: '3.2.0',
  evidence: 'state',
  target: '4.1.0',
  applications: [{ key: '.', installed: '3.2.0' }],
  installs: [],
  migrations: [{ id: 'legacy-unit-shape', applications: [] }],
  operations: [],
  suppressed: [],
  inapplicable: [],
  safety: { repository: true, changes: [], required: false },
};

describe('upgrade plan report', () => {
  it('states each resolved fact in the order an Agent needs it', () => {
    const text = renderUpgradePlan(plan);

    expect(text.split('\n')).toEqual([
      'Blueprint upgrade — plan',
      '  Source: 3.2.0 (recorded in .blueprint-lifecycle.json)',
      '  Target: 4.1.0 (the running @kekkai/blueprint package is the only target authority)',
      '  Applications: `.` (installed 3.2.0)',
      '  Dependency: every adopted application already has @kekkai/blueprint 4.1.0',
      '  Deterministic migrations (run in code through `blueprint init`): legacy-unit-shape',
      '  Semantic operations for the coding Agent: none — every change in this interval is '
      + 'deterministic',
      '  Safety: resuming the recorded pending upgrade; uncommitted upgrade work is expected',
    ]);
  });

  it('names the resume heading, completed work, and the absence of migrations', () => {
    const text = renderUpgradePlan({
      ...plan,
      mode: 'resume',
      migrations: [],
      operations: [{
        id: 'a', introducedIn: '4.0.0', applications: ['.', 'apps/web'], completed: true,
      }],
    });

    expect(text).toContain('Blueprint upgrade — resuming the pending upgrade');
    expect(text).toContain('Deterministic migrations: none beyond regenerating Blueprint outputs');
    expect(text).toContain('1. a (4.0.0) → `.`, `apps/web` — already completed; not repeated');
  });

  it('numbers operations and ends a dry run with the next step', () => {
    expect(renderUpgradePlan({
      ...plan,
      dryRun: true,
      operations: [
        { id: 'a', introducedIn: '4.0.0', applications: ['.'], completed: false },
        { id: 'b', introducedIn: '4.1.0', applications: ['.'], completed: false },
      ],
    }).split('\n').slice(-5)).toEqual([
      '  Semantic operations for the coding Agent, resolved across (3.2.0, 4.1.0]:',
      '    1. a (4.0.0) → `.`',
      '    2. b (4.1.0) → `.`',
      '  Safety: resuming the recorded pending upgrade; uncommitted upgrade work is expected',
      '  Next: re-run without --dry-run to apply this plan.',
    ]);
  });
});

describe('upgrade progress messages', () => {
  it('narrates each step of an upgrade run', () => {
    expect([
      renderUpgradeStateRecorded('.blueprint-lifecycle.json', '3.2.0', '4.1.0'),
      renderUpgradeInstallStarting('npm install -D x', '.'),
      renderUpgradeHandoff('4.1.0'),
      renderUpgradeReconcile('apps/web'),
      renderUpgradeVerificationPending(),
    ]).toEqual([
      '  ✓ write: .blueprint-lifecycle.json (pending upgrade 3.2.0 → 4.1.0 recorded before any '
      + 'other change; if this run is interrupted, re-run `blueprint upgrade` to resume)',
      '  → install: `npm install -D x` in `.` — moving the project dependency to the running '
      + 'target',
      '  → continuing with the project-installed @kekkai/blueprint 4.1.0, so every config load and '
      + 'generated output uses the upgraded package',
      'Reconciling `apps/web` through `blueprint init` (deterministic migrations and generated '
      + 'outputs):',
      'Upgrade pending — verification did not pass. Fix what is listed above, then re-run '
      + '`npx blueprint upgrade`; the lifecycle checkpoint stays where it was.',
    ]);
  });

  it('counts what remains after recording an operation', () => {
    expect(renderUpgradeOperationCompleted('a', 2))
      .toBe('  ✓ operation a recorded as complete — 2 semantic operation(s) remain');
  });

  it('reports passing verification and a doctor failure without skipped checks', () => {
    expect(renderUpgradeVerificationResult({
      application: '.',
      inspect: { ok: true, findings: 0 },
      doctor: { verdict: 'complete', failed: [], skipped: [] },
    })).toBe('  ✓ inspect --baseline passed in `.`\n  ✓ doctor complete in `.`');

    expect(renderUpgradeVerificationResult({
      application: '.',
      inspect: { ok: true, findings: 0 },
      doctor: { verdict: 'incomplete', failed: ['config'], skipped: [] },
    })).toContain('✗ doctor incomplete in `.` — failed: config — run `npx blueprint doctor` there');
  });
});

describe('upgrade instructions and playbook', () => {
  it('ships instructions only for catalog operations', () => {
    expect(UPGRADE_INSTRUCTION_IDS).toEqual(['review-retired-module-private']);

    expect(renderUpgradeInstruction('review-retired-module-private'))
      .toContain('`allowedImporters`');

    expect(renderUpgradeInstruction('unknown')).toBeNull();
    expect(renderUpgradeInstruction('toString')).toBeNull();
  });

  it('branches the module.private review on where it was declared, not on a preset call', () => {
    const text = renderUpgradeInstruction('review-retired-module-private')!;
    const [restate, preset, cleanup] = text.split('\n- ').slice(1);

    expect(text).toContain('not by whether the config calls a preset');

    expect(restate.replace(/\s+/g, ' ')).toMatch(/^If the owner's own source declares `module\.private`.*retired private unit-member\/path name, not as a layer/);

    expect(preset.replace(/\s+/g, ' '))
      .toMatch(/^If no owner source declares it, `module\.private` came from a Blueprint 3\.2 preset call/);

    expect(cleanup).toContain('if one exists');
  });

  it('describes machine and confirmation verification', () => {
    expect(renderUpgradeVerification({ kind: 'no-files', pattern: 'x*' }))
      .toBe('Blueprint verifies that no `x*` file remains in the listed applications.');

    expect(renderUpgradeVerification({ kind: 'confirm' })).toContain('explicit confirmation');
  });

  it('marks completed history it converges from and applications without evidence', () => {
    const playbook = renderUpgradePlaybook({
      source: '4.0.0',
      target: '4.1.0',
      migrations: [],
      operations: [{
        id: 'final',
        introducedIn: '4.1.0',
        applications: ['.', 'apps/web'],
        evidence: { '.': [] },
        supersedes: [{ id: 'seed', completed: true }],
        completed: false,
        instruction: 'Do it.' as never,
        verification: { kind: 'confirm' },
      }],
    });

    expect(playbook).toContain('Deterministic migrations: none beyond regenerated outputs.');
    expect(playbook).toContain('Applications: `.`, `apps/web`');

    expect(playbook).toContain('Replaces `seed`, which already ran in this repository: '
      + 'converge from its result');
  });

  it('numbers every operation section and names each deterministic migration', () => {
    const operation = {
      introducedIn: '4.0.0',
      applications: ['.'],
      evidence: {},
      supersedes: [],
      completed: true,
      instruction: 'Do it.' as never,
      verification: { kind: 'confirm' as const },
    };

    const playbook = renderUpgradePlaybook({
      source: '3.2.0',
      target: '4.1.0',
      migrations: ['one', 'two'],
      operations: [{ ...operation, id: 'first' }, { ...operation, id: 'second' }],
    });

    expect(playbook).toContain('- Deterministic migrations: `one`, `two`.');
    expect(playbook).toContain('### 1. `first` — introduced in 4.0.0 — done — do not repeat');
    expect(playbook).toContain('### 2. `second` — introduced in 4.0.0 — done — do not repeat');
  });
});

describe('upgrade refusals', () => {
  it.each<[UpgradeRefusalFact, string]>([
    [
      { kind: 'unsupported-source', source: '3.1.0', checkpoint: '3.2.0' },
      'install @kekkai/blueprint@3.2.0',
    ],
    [
      { kind: 'unproven-legacy-source', installed: '4.1.0', checkpoint: '3.2.0' },
      'legacy Blueprint config overlaps releases below and inside the supported upgrade window',
    ],
    [{ kind: 'no-manifest', application: 'apps/web' }, 'no package.json above apps/web declares'],
    [{ kind: 'no-pending', id: 'x' }, '`npx blueprint upgrade --dry-run`'],
    [{ kind: 'unknown-operation', id: 'x', pending: ['a', 'b'] }, 'Pending: a, b.'],
    [{ kind: 'git-required' }, 'Initialize or enter the repository first. Nothing was changed.'],
    [
      { kind: 'installed-newer', application: 'apps/web', installed: '4.2.0', target: '4.1.0' },
      'apps/web resolves @kekkai/blueprint 4.2.0, which is newer than the running 4.1.0',
    ],
  ])('explains %j', (fact, fragment) => {
    expect(renderUpgradeRefusal(fact)).toContain(fragment);
  });
});
