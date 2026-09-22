import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { prepareRecovery, validateRecoveryIdentity, verifyRecovery } from './release-recovery.mjs';

const sha = 'a'.repeat(40);
const toolSha = 'b'.repeat(40);

const manifest = {
  repository: 'taco3064/blueprint', headSha: sha, workflowRunId: '42', version: '4.1.0',
  tarball: 'kekkai-blueprint-4.1.0.tgz',
};

const workflow = {
  id: 42, head_sha: sha, head_branch: 'main', event: 'push', status: 'completed',
  conclusion: 'success', path: '.github/workflows/ci.yml',
};

const artifact = { id: 7, name: `blueprint-candidate-${sha}`, expired: false };
const identity = { manifest, sha, toolSha, runId: '42', tag: 'v4.1.0', run: workflow };
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'release-recovery-test-'));

  roots.push(directory);

  const record = {
    manifest, artifact, toolSha, tag: 'v4.1.0',
    checkout: path.join(directory, 'candidate'),
    manifestFile: path.join(directory, 'artifact', 'candidate.json'),
    tarball: path.join(directory, 'artifact', manifest.tarball),
  };

  const candidate = { manifest, artifact };
  const resolve = vi.fn(() => candidate);

  const run = vi.fn((file, args, options = {}) => {
    if (file === 'gh' && args[0] === 'api') {
      return JSON.stringify(args[1].includes('/artifacts')
        ? { total_count: 1, artifacts: [artifact] }
        : workflow);
    }

    if (file === 'git' && args[0] === 'rev-parse') return options.cwd ? sha : toolSha;
    if (file === process.execPath && args[0].endsWith('changelog-section.mjs')) return 'Candidate notes\n';

    return '';
  });

  return { directory, record, run, resolve };
}

describe('candidate recovery identity', () => {
  it('allows different publisher and product SHAs without transferring evidence', () => {
    expect(validateRecoveryIdentity(identity)).toBe(true);
  });

  it.each([
    ['short candidate SHA', { sha: 'abc' }],
    ['short tool SHA', { toolSha: 'def' }],
    ['invalid run ID', { runId: '../42' }],
    ['another candidate', { sha: 'c'.repeat(40) }],
    ['another run', { runId: '43' }],
    ['another repository', { manifest: { ...manifest, repository: 'other/repo' } }],
    ['wrong tag', { tag: 'v4.2.0' }],
    ['prerelease', { manifest: { ...manifest, version: '4.1.0-rc.1' }, tag: 'v4.1.0-rc.1' }],
    ['escaping tarball', { manifest: { ...manifest, tarball: '../package.tgz' } }],
    ['foreign workflow', { run: { ...workflow, path: '.github/workflows/other.yml' } }],
    ['PR run', { run: { ...workflow, event: 'pull_request' } }],
    ['failed CI', { run: { ...workflow, conclusion: 'failure' } }],
  ])('rejects %s', (_name, patch) => {
    expect(() => validateRecoveryIdentity({ ...identity, ...patch })).toThrow();
  });
});

describe('recovery preparation and final verification', () => {
  it('uses newer gate scripts with the original checkout and original downloaded artifact', () => {
    const { directory, run, resolve } = fixture();
    const record = prepareRecovery({ sha, runId: '42', tag: 'v4.1.0', directory }, { run, resolve });

    expect(record.manifest.headSha).toBe(sha);
    expect(record.toolSha).toBe(toolSha);
    expect(resolve).toHaveBeenCalledWith(path.join(directory, 'artifact', 'candidate.json'));
    expect(run).toHaveBeenCalledWith('git', ['worktree', 'add', '--detach', record.checkout, sha]);

    for (const gate of ['release-changeset-gate.mjs', 'release-field-gate.mjs']) {
      expect(run).toHaveBeenCalledWith(process.execPath,
        [expect.stringContaining(gate)], { cwd: record.checkout });
    }

    expect(JSON.parse(fs.readFileSync(path.join(directory, 'recovery.json'), 'utf8'))).toEqual(record);
    expect(fs.readFileSync(path.join(directory, 'release-notes.md'), 'utf8')).toBe('Candidate notes\n');
    expect(run.mock.calls.some(([, args]) => args.includes('publish') || args.includes('pack'))).toBe(false);
  });

  it.each(['release-changeset-gate.mjs', 'release-field-gate.mjs'])('stops on %s refusal', (gate) => {
    const { directory, run, resolve } = fixture();
    const normal = run.getMockImplementation();

    run.mockImplementation((file, args, options) => {
      if (args[0].endsWith(gate)) throw new Error('gate rejected');

      return normal(file, args, options);
    });

    expect(() => prepareRecovery({ sha, runId: '42', tag: 'v4.1.0', directory }, { run, resolve }))
      .toThrow('gate rejected');

    expect(fs.existsSync(path.join(directory, 'recovery.json'))).toBe(false);
  });

  it.each([
    ['tool moved', 'rev-parse', 'c'.repeat(40), false],
    ['wrong candidate checkout', 'rev-parse', toolSha, true],
    ['dirty candidate', 'status', ' M package.json', true],
    ['moved lightweight tag', 'ls-remote', `${toolSha}\trefs/tags/v4.1.0`, false],
    ['moved annotated tag', 'ls-remote', `${sha}\trefs/tags/v4.1.0\n${toolSha}\trefs/tags/v4.1.0^{}`, false],
  ])('rejects %s on revalidation', (_name, command, output, inCheckout) => {
    const { record, run, resolve } = fixture();
    const normal = run.getMockImplementation();

    run.mockImplementation((file, args, options = {}) => {
      if (file === 'git' && args[0] === command && Boolean(options.cwd) === inCheckout) return output;

      return normal(file, args, options);
    });

    expect(() => verifyRecovery(record, { run, resolve })).toThrow();
  });

  it.each([
    `${sha}\trefs/tags/v4.1.0`,
    `${toolSha}\trefs/tags/v4.1.0\n${sha}\trefs/tags/v4.1.0^{}`,
  ])('accepts an existing tag resolving to the candidate', (output) => {
    const { record, run, resolve } = fixture();
    const normal = run.getMockImplementation();

    run.mockImplementation((file, args, options) => args[0] === 'ls-remote' ? output : normal(file, args, options));
    expect(verifyRecovery(record, { run, resolve })).toEqual({ manifest, artifact });
  });

  it.each([
    { manifest: { ...manifest, version: '4.2.0' }, artifact },
    { manifest, artifact: { ...artifact, id: 8 } },
  ])('rejects a substituted resolved artifact', (candidate) => {
    const { record, run } = fixture();

    expect(() => verifyRecovery(record, { run, resolve: () => candidate })).toThrow('Recovery artifact changed');
  });

  it('rejects a substituted publication path', () => {
    const { record, run, resolve } = fixture();

    expect(() => verifyRecovery({ ...record, tarball: '/other/package.tgz' }, { run, resolve }))
      .toThrow('Recovery artifact changed');
  });

  it.each([
    { total_count: 0, artifacts: [] },
    { total_count: 1, artifacts: [{ ...artifact, expired: true }] },
    { total_count: 2, artifacts: [artifact, artifact] },
  ])('refuses unavailable or ambiguous CI artifacts before downloading', (inventory) => {
    const { directory, run, resolve } = fixture();
    const normal = run.getMockImplementation();

    run.mockImplementation((file, args, options) => args[1]?.includes('/artifacts')
      ? JSON.stringify(inventory)
      : normal(file, args, options));

    expect(() => prepareRecovery({ sha, runId: '42', tag: 'v4.1.0', directory }, { run, resolve }))
      .toThrow();

    expect(resolve).not.toHaveBeenCalled();
    expect(run.mock.calls.some(([, args]) => args.includes('download'))).toBe(false);
  });

  it('propagates tampered original tarball rejection before running candidate gates', () => {
    const { record, run } = fixture();

    expect(() => verifyRecovery(record, {
      run, resolve: () => { throw new Error('Candidate tarball SHA-256 does not match its manifest.'); },
    })).toThrow(/SHA-256/);

    expect(run.mock.calls.some(([file]) => file === process.execPath)).toBe(false);
  });

  it('rejects a candidate outside publisher ancestry', () => {
    const { record, run, resolve } = fixture();
    const normal = run.getMockImplementation();

    run.mockImplementation((file, args, options) => {
      if (args[0] === 'merge-base') throw new Error('not an ancestor');

      return normal(file, args, options);
    });

    expect(() => verifyRecovery(record, { run, resolve })).toThrow('not an ancestor');
    expect(resolve).not.toHaveBeenCalled();
  });
});
