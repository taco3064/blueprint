import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { conflictPaths, githubOutputs, inspectIntegration } from './ci-preflight.mjs';

function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-preflight-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

  git('init', '-q');
  git('config', 'user.name', 'Blueprint Test');
  git('config', 'user.email', 'blueprint@example.test');
  fs.writeFileSync(path.join(root, 'shared.txt'), 'base\n');
  git('add', '.');
  git('commit', '-qm', 'base');
  git('branch', '-M', 'main');

  return { root, git };
}

describe('CI mergeability preflight', () => {
  it('records the exact clean integration candidate', () => {
    const { root, git } = repository();
    const base = git('rev-parse', 'main');

    git('switch', '-qc', 'feature');
    fs.writeFileSync(path.join(root, 'feature.txt'), 'feature\n');
    git('add', '.');
    git('commit', '-qm', 'feature');

    git('switch', '-q', 'main');
    git('merge', '--no-ff', '-qm', 'candidate', 'feature');
    const candidate = git('rev-parse', 'HEAD');
    const result = inspectIntegration(root, { event: 'pull_request', base, head: 'feature', candidate });

    expect(result).toMatchObject({
      baseHeadSha: base,
      mergeBaseSha: base,
      mergeable: true,
      conflicts: [],
    });

    expect(result.headSha).toBe(git('rev-parse', 'feature'));
    expect(result.candidateCommitSha).toBe(candidate);
    expect(result.integrationTreeSha).toMatch(/^[0-9a-f]{40}$/);
    expect(githubOutputs(result)).toContain(`head_sha=${result.headSha}\n`);
  });

  it('combines independent base and head changes into the recorded tree', () => {
    const { root, git } = repository();

    git('switch', '-qc', 'feature');
    fs.writeFileSync(path.join(root, 'feature.txt'), 'feature\n');
    git('add', '.');
    git('commit', '-qm', 'feature');
    const head = git('rev-parse', 'HEAD');

    git('switch', '-q', 'main');
    fs.writeFileSync(path.join(root, 'base.txt'), 'base head\n');
    git('add', '.');
    git('commit', '-qm', 'base head');
    const base = git('rev-parse', 'HEAD');

    git('merge', '--no-ff', '-qm', 'candidate', 'feature');
    const candidate = git('rev-parse', 'HEAD');

    const result = inspectIntegration(root, {
      event: 'pull_request',
      base,
      head,
      candidate,
    });

    expect(result).toMatchObject({ mergeable: true, baseHeadSha: base, headSha: head });
    expect(result.integrationTreeSha).toBe(git('rev-parse', `${candidate}^{tree}`));
    expect(result.integrationTreeSha).not.toBe(git('rev-parse', `${base}^{tree}`));
    expect(result.integrationTreeSha).not.toBe(git('rev-parse', `${head}^{tree}`));
  });

  it('fails closed and names conflicting paths', () => {
    const { root, git } = repository();

    git('switch', '-qc', 'feature');
    fs.writeFileSync(path.join(root, 'shared.txt'), 'feature\n');
    git('commit', '-qam', 'feature');
    const head = git('rev-parse', 'HEAD');

    git('switch', '-q', 'main');
    fs.writeFileSync(path.join(root, 'shared.txt'), 'main\n');
    git('commit', '-qam', 'main');

    expect(inspectIntegration(root, { event: 'pull_request', base: 'main', head, candidate: 'main' })).toMatchObject({
      headSha: head,
      baseHeadSha: git('rev-parse', 'main'),
      mergeable: false,
      integrationTreeSha: null,
      candidateCommitSha: null,
      conflicts: ['shared.txt'],
    });
  });

  it('treats a main push as its own integration candidate', () => {
    const { root, git } = repository();
    const head = git('rev-parse', 'HEAD');

    expect(inspectIntegration(root, { event: 'push', head: 'HEAD' })).toEqual({
      event: 'push',
      headSha: head,
      baseHeadSha: head,
      mergeBaseSha: head,
      integrationTreeSha: git('rev-parse', 'HEAD^{tree}'),
      candidateCommitSha: head,
      mergeable: true,
      conflicts: [],
    });
  });

  it('extracts every conflict path once', () => {
    expect(conflictPaths([
      '100644 aaaaaaa 1\tsrc/a.ts',
      '100644 bbbbbbb 2\tsrc/a.ts',
      'CONFLICT (content): Merge conflict in src/a.ts',
      'CONFLICT (add/add): Merge conflict in src/b.ts',
    ].join('\n'))).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('fails closed for an unknown event', () => {
    const { root } = repository();

    expect(() => inspectIntegration(root, { event: 'schedule', head: 'HEAD' }))
      .toThrow(/Unsupported/);
  });
});
