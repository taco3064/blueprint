import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  aggregateMutation,
  classifyShardResult,
  latestReviewedSha,
  partitionRanges,
  planMutation,
  renderSummary,
  selectMutationBase,
  verifyManifest,
} from './mutation-ci.mjs';

function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-mutation-ci-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

  git('init', '-q');
  git('config', 'user.name', 'Blueprint Test');
  git('config', 'user.email', 'blueprint@example.test');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'rule.ts'), 'export const rule = 1\n');
  git('add', '.');
  git('commit', '-qm', 'base');
  git('branch', '-M', 'main');

  return { root, git };
}

describe('mutation CI planning', () => {
  it('uses the complete PR scope before a formal review', () => {
    const { root, git } = repository();
    const base = git('rev-parse', 'HEAD');

    fs.appendFileSync(path.join(root, 'src', 'rule.ts'), 'export const next = 2\n');
    git('commit', '-qam', 'candidate');

    expect(planMutation(root, { base, reviews: [], targetLines: 1 })).toMatchObject({
      authority: 'full-pr',
      mutationBaseSha: base,
      changedLines: 1,
      files: ['src/rule.ts'],
    });
  });

  it('accumulates repairs after a same-identity owner review with prior mutation authority', () => {
    const { root, git } = repository();
    const base = git('rev-parse', 'HEAD');

    fs.appendFileSync(path.join(root, 'src', 'rule.ts'), 'export const reviewed = 2\n');
    git('commit', '-qam', 'reviewed');
    const reviewed = git('rev-parse', 'HEAD');

    fs.appendFileSync(path.join(root, 'src', 'rule.ts'), 'export const repair = 3\n');
    git('commit', '-qam', 'repair');

    expect(selectMutationBase(root, {
      baseHeadSha: base,
      headSha: git('rev-parse', 'HEAD'),
      reviews: [{
        id: 1,
        state: 'COMMENTED',
        commit_id: reviewed,
        submitted_at: '2026-01-01',
        author_association: 'COLLABORATOR',
        user: { login: 'owner', type: 'User' },
      }],
      checkpoints: [{ head_sha: reviewed, name: 'Mutation aggregate', conclusion: 'success' }],
      author: 'owner',
    })).toMatchObject({ authority: 'reviewed-repair', mutationBaseSha: reviewed, reviewedSha: reviewed });
  });

  it('falls back to the full PR scope after lineage changes', () => {
    const { root, git } = repository();
    const oldBase = git('rev-parse', 'HEAD');

    git('switch', '-qc', 'candidate');
    fs.appendFileSync(path.join(root, 'src', 'rule.ts'), 'export const reviewed = 2\n');
    git('commit', '-qam', 'reviewed');
    const reviewed = git('rev-parse', 'HEAD');

    git('switch', '-q', 'main');
    fs.writeFileSync(path.join(root, 'base.txt'), 'advanced\n');
    git('add', '.');
    git('commit', '-qm', 'advanced base');
    const newBase = git('rev-parse', 'HEAD');

    git('switch', '-q', 'candidate');
    git('merge', '-qm', 'merge base', 'main');

    expect(selectMutationBase(root, {
      baseHeadSha: newBase,
      headSha: git('rev-parse', 'HEAD'),
      reviews: [{
        id: 1,
        state: 'APPROVED',
        commit_id: reviewed,
        submitted_at: '2026-01-01',
        author_association: 'OWNER',
        user: { login: 'owner', type: 'User' },
      }],
      author: 'owner',
      checkpoints: [{ head_sha: reviewed, name: 'Mutation aggregate', conclusion: 'success' }],
    })).toMatchObject({ authority: 'full-pr-fallback', mutationBaseSha: newBase, reviewedSha: reviewed });

    expect(oldBase).not.toBe(newBase);
  });

  it('uses only formal non-dismissed reviews and picks the latest', () => {
    expect(latestReviewedSha([[{
      id: 2,
      state: 'DISMISSED',
      commit_id: 'b',
      submitted_at: '2026-02-01',
      author_association: 'OWNER',
    }], [
      { id: 1, state: 'COMMENTED', commit_id: 'a', submitted_at: '2026-01-01', author_association: 'MEMBER' },
      { id: 3, state: 'CHANGES_REQUESTED', commit_id: 'c', submitted_at: '2026-03-01', author_association: 'COLLABORATOR' },
    ]])).toBe('c');
  });

  it('does not let a review erase production scope without prior mutation authority', () => {
    const { root, git } = repository();
    const base = git('rev-parse', 'HEAD');

    fs.appendFileSync(path.join(root, 'src', 'rule.ts'), 'export const reviewed = 2\n');
    git('commit', '-qam', 'reviewed');
    const reviewed = git('rev-parse', 'HEAD');

    fs.appendFileSync(path.join(root, 'src', 'rule.ts'), 'export const repair = 3\n');
    git('commit', '-qam', 'repair');

    expect(selectMutationBase(root, {
      baseHeadSha: base,
      headSha: git('rev-parse', 'HEAD'),
      reviews: [{
        id: 1,
        state: 'APPROVED',
        commit_id: reviewed,
        author_association: 'COLLABORATOR',
        user: { login: 'reviewer', type: 'User' },
      }],
    })).toMatchObject({ authority: 'full-pr-fallback', mutationBaseSha: base });
  });

  it('partitions every authoritative range exactly once', () => {
    const ranges = { 'src/a.ts': [[1, 205]], 'src/b.ts': [[4, 8]] };
    const shards = partitionRanges(ranges, 100);
    const proof = verifyManifest({ ranges, shards });

    expect(shards.map((shard) => shard.changedLines)).toEqual([100, 100, 10]);
    expect(proof).toMatchObject({ complete: true, duplicates: [] });
    expect(proof.represented).toHaveLength(210);
  });

  it('keeps partition coverage complete, bounded, and deterministic', () => {
    fc.assert(fc.property(
      fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 20 }),
      (lengths) => {
        const ranges = Object.fromEntries(lengths.map((length, index) => [
          `src/${String(index).padStart(2, '0')}.ts`,
          [[1, length]],
        ]));

        const reversed = Object.fromEntries(Object.entries(ranges).reverse());
        const shards = partitionRanges(ranges, 25, 8);

        expect(shards).toEqual(partitionRanges(reversed, 25, 8));
        expect(shards.length).toBeLessThanOrEqual(8);

        expect(verifyManifest({ ranges, shards })).toMatchObject({
          complete: true,
          duplicates: [],
        });
      },
    ));
  });
});

describe('mutation CI aggregation', () => {
  const manifest = {
    authority: 'full-pr',
    mutationBaseSha: 'a'.repeat(40),
    mergeBaseSha: 'a'.repeat(40),
    reviewedSha: null,
    headSha: 'b'.repeat(40),
    changedLines: 2,
    files: ['src/a.ts'],
    ranges: { 'src/a.ts': [[1, 2]] },
    planHash: 'plan-hash',
    shards: [
      { id: '000', scopes: ['src/a.ts:1-1'] },
      { id: '001', scopes: ['src/a.ts:2-2'] },
    ],
  };

  const result = (summary) => ({
    planHash: manifest.planHash,
    head: manifest.headSha,
    base: manifest.mutationBaseSha,
    scopes: manifest.shards.find((shard) => shard.id === summary.shard).scopes,
    ...summary,
  });

  it('passes only when every shard exists and no unacceptable result remains', () => {
    const summary = aggregateMutation(manifest, [
      result({ shard: '000', status: 'passed', runnerExit: 0, total: 2, statuses: { Killed: 2 }, unacceptableMutants: [] }),
      result({ shard: '001', status: 'passed', runnerExit: 0, total: 1, statuses: { Ignored: 1 }, unacceptableMutants: [] }),
    ]);

    expect(summary).toMatchObject({ status: 'passed', passed: true, total: 3, statuses: { Killed: 2, Ignored: 1 } });
    expect(renderSummary(summary)).toContain('scope: 2 production line(s), 2 shard(s)');
  });

  it('fails with actionable source and shard evidence', () => {
    const mutant = { file: 'src/a.ts', line: 2, status: 'Survived', mutator: 'ConditionalExpression', replacement: 'false' };

    const summary = aggregateMutation(manifest, [
      result({ shard: '000', status: 'failed', runnerExit: 1, total: 1, statuses: { Survived: 1 }, unacceptableMutants: [mutant] }),
    ]);

    expect(summary).toMatchObject({ passed: false, missingShards: ['001'], unacceptableMutants: [{ shard: '000', ...mutant }] });
    expect(renderSummary(summary)).toContain('`src/a.ts:2` — Survived / ConditionalExpression (shard 000)');
  });

  it('rejects duplicate or wrong-authority shard artifacts', () => {
    const first = result({
      shard: '000',
      status: 'passed',
      runnerExit: 0,
      total: 1,
      statuses: { Killed: 1 },
      unacceptableMutants: [],
    });

    const summary = aggregateMutation(manifest, [first, { ...first, head: 'c'.repeat(40) }]);

    expect(summary).toMatchObject({
      passed: false,
      duplicateShards: ['000'],
      invalidShards: ['000'],
      missingShards: ['001'],
    });
  });

  it('fails closed when a runner exits nonzero despite a usable report', () => {
    const outcome = classifyShardResult(2, {
      total: 1,
      passed: true,
      statuses: { Killed: 1 },
    });

    expect(outcome).toEqual({ status: 'error', reason: 'exit-2', exitCode: 2 });

    const summary = aggregateMutation(manifest, [
      result({ shard: '000', status: 'passed', runnerExit: 2, total: 1, statuses: { Killed: 1 }, unacceptableMutants: [] }),
      result({ shard: '001', status: 'passed', runnerExit: 0, total: 1, statuses: { Killed: 1 }, unacceptableMutants: [] }),
    ]);

    expect(summary).toMatchObject({
      status: 'failed',
      passed: false,
      invalidShards: ['000'],
      failedShards: [{ shard: '000', status: 'error', reason: 'exit-2' }],
    });
  });
});
