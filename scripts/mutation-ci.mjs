import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  changedLineCount,
  parseChangedRanges,
  summarizeMutationReport,
  unacceptableMutants,
} from './mutation-smoke.mjs';

function git(root, args, allowFailure = false) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });

  if (!allowFailure && result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `git ${args.join(' ')} failed`).trim());
  }

  return result;
}

function resolveCommit(root, ref) {
  return git(root, ['rev-parse', '--verify', `${ref}^{commit}`]).stdout.trim();
}

function isAncestor(root, ancestor, descendant) {
  return git(root, ['merge-base', '--is-ancestor', ancestor, descendant], true).status === 0;
}

export function latestReviewedSha(reviews) {
  return reviews
    .flat(Infinity)
    .filter((review) => review?.commit_id
      && review.state !== 'DISMISSED'
      && review.user?.type !== 'Bot'
      && ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(review.author_association))
    .sort((left, right) => {
      const time = String(left.submitted_at ?? '').localeCompare(String(right.submitted_at ?? ''));

      return time || Number(left.id ?? 0) - Number(right.id ?? 0);
    })
    .at(-1)?.commit_id ?? null;
}

export function selectMutationBase(root, {
  baseHeadSha,
  headSha,
  reviews,
  checkpoints = [],
}) {
  const mergeBaseSha = git(root, ['merge-base', baseHeadSha, headSha]).stdout.trim();
  const reviewedSha = latestReviewedSha(reviews);

  if (!reviewedSha) {
    return { mutationBaseSha: mergeBaseSha, mergeBaseSha, reviewedSha: null, authority: 'full-pr' };
  }

  const exists = git(root, ['cat-file', '-e', `${reviewedSha}^{commit}`], true).status === 0;

  const priorAuthority = checkpoints.some((check) => check?.head_sha === reviewedSha
    && check.name === 'Mutation aggregate' && check.conclusion === 'success');

  const lineageMergeBase = exists
    ? git(root, ['merge-base', mergeBaseSha, reviewedSha], true)
    : null;

  const sameLineage = lineageMergeBase?.status === 0
    && lineageMergeBase.stdout.trim() === mergeBaseSha;

  if (!exists || !priorAuthority || !sameLineage || !isAncestor(root, reviewedSha, headSha)) {
    return { mutationBaseSha: mergeBaseSha, mergeBaseSha, reviewedSha, authority: 'full-pr-fallback' };
  }

  return { mutationBaseSha: reviewedSha, mergeBaseSha, reviewedSha, authority: 'reviewed-repair' };
}

function scopeParts(ranges) {
  return Object.entries(ranges)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([file, fileRanges]) => fileRanges.map(([start, end]) => ({
      file,
      start,
      end,
      lines: end - start + 1,
    })));
}

export function partitionRanges(ranges, targetLines = 100, maxShards = 64) {
  if (!Number.isSafeInteger(targetLines) || targetLines < 1) throw new Error('targetLines must be a positive integer.');
  if (!Number.isSafeInteger(maxShards) || maxShards < 1) throw new Error('maxShards must be a positive integer.');

  const totalLines = changedLineCount(ranges);
  const shardLines = Math.max(targetLines, Math.ceil(totalLines / maxShards));

  const parts = scopeParts(ranges);

  if (!parts.length) return [{ id: '000', changedLines: 0, scopes: [], ranges: {} }];

  const shards = [];

  for (const part of parts) {
    let cursor = part.start;

    while (cursor <= part.end) {
      let shard = shards.at(-1);

      if (!shard || shard.changedLines === shardLines) {
        shard = {
          id: String(shards.length).padStart(3, '0'),
          changedLines: 0,
          scopes: [],
          ranges: {},
        };

        shards.push(shard);
      }

      const capacity = shardLines - shard.changedLines;
      const end = Math.min(part.end, cursor + capacity - 1);
      const lines = end - cursor + 1;

      shard.changedLines += lines;
      shard.scopes.push(`${part.file}:${cursor}-${end}`);
      shard.ranges[part.file] = [...(shard.ranges[part.file] ?? []), [cursor, end]];
      cursor = end + 1;
    }
  }

  return shards;
}

export function verifyManifest(manifest) {
  const lines = (ranges) => Object.entries(ranges).flatMap(([file, fileRanges]) =>
    fileRanges.flatMap(([start, end]) => Array.from(
      { length: end - start + 1 },
      (_, offset) => `${file}:${start + offset}`,
    )));

  const authoritative = lines(manifest.ranges).sort();
  const represented = manifest.shards.flatMap((shard) => lines(shard.ranges)).sort();
  const duplicates = represented.filter((line, index) => line === represented[index - 1]);

  return {
    complete: JSON.stringify(authoritative) === JSON.stringify(represented),
    duplicates: [...new Set(duplicates)],
    authoritative,
    represented,
  };
}

export function planMutation(root, {
  base,
  head = 'HEAD',
  reviews = [],
  checkpoints = [],
  targetLines = 100,
}) {
  const baseHeadSha = resolveCommit(root, base);
  const headSha = resolveCommit(root, head);

  const selected = selectMutationBase(root, {
    baseHeadSha,
    headSha,
    reviews,
    checkpoints,
  });

  const diff = git(root, [
    'diff', '--unified=0', '--no-color', '--diff-filter=ACMR',
    selected.mutationBaseSha, headSha, '--', 'src',
  ]).stdout;

  const ranges = parseChangedRanges(diff);
  const shards = partitionRanges(ranges, targetLines);

  const manifest = {
    baseHeadSha,
    headSha,
    ...selected,
    changedLines: changedLineCount(ranges),
    files: Object.keys(ranges),
    ranges,
    shards,
  };

  manifest.planHash = crypto.createHash('sha256')
    .update(JSON.stringify(manifest))
    .digest('hex');

  const proof = verifyManifest(manifest);

  if (!proof.complete || proof.duplicates.length) throw new Error('Mutation shard manifest is incomplete or overlapping.');

  return manifest;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function classifyShardResult(runnerExit, mutation) {
  if (runnerExit !== 0) {
    return { status: 'error', reason: `exit-${runnerExit}`, exitCode: 2 };
  }

  if (mutation.total === 0) {
    return { status: 'skipped', reason: 'no-mutants-generated', exitCode: 0 };
  }

  return mutation.passed
    ? { status: 'passed', exitCode: 0 }
    : { status: 'failed', exitCode: 1 };
}

export function verifyMutationCheckout(root, manifest) {
  const checkoutSha = resolveCommit(root, 'HEAD');

  if (checkoutSha !== manifest.headSha) {
    throw new Error(`Mutation checkout ${checkoutSha} does not match plan head ${manifest.headSha}.`);
  }

  return true;
}

function runShard(root, manifest, shardId, output) {
  verifyMutationCheckout(root, manifest);

  const shard = manifest.shards.find((candidate) => candidate.id === shardId);

  if (!shard) throw new Error(`Unknown mutation shard: ${shardId}`);

  const scope = {
    shard: shard.id,
    shardCount: manifest.shards.length,
    base: manifest.mutationBaseSha,
    mergeBase: manifest.mergeBaseSha,
    reviewedSha: manifest.reviewedSha,
    head: manifest.headSha,
    changedLines: shard.changedLines,
    ranges: shard.ranges,
    scopes: shard.scopes,
    planHash: manifest.planHash,
  };

  writeJson(path.join(output, 'scope.json'), scope);

  if (!shard.scopes.length) {
    const summary = {
      status: 'skipped',
      reason: 'no-changed-production-lines',
      shard: shard.id,
      changedLines: 0,
      planHash: manifest.planHash,
      head: manifest.headSha,
      base: manifest.mutationBaseSha,
      scopes: shard.scopes,
    };

    writeJson(path.join(output, 'summary.json'), summary);

    return { exitCode: 0, summary };
  }

  const reportSource = path.join(root, 'reports', 'mutation', 'mutation.json');
  const logFile = path.join(output, 'run.log');
  const log = fs.openSync(logFile, 'w');
  const cli = path.join(root, 'node_modules', '@stryker-mutator', 'core', 'bin', 'stryker.js');

  fs.rmSync(reportSource, { force: true });

  const result = spawnSync(process.execPath, [
    cli,
    'run',
    '--mutate', `${shard.scopes.join(',')},!src/**/*.test.ts`,
    '--reporters', 'json,clear-text',
  ], {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: ['ignore', log, log],
    timeout: 20 * 60 * 1000,
  });

  fs.closeSync(log);

  if (result.error || result.signal || !fs.existsSync(reportSource)) {
    const summary = {
      status: 'error',
      shard: shard.id,
      changedLines: shard.changedLines,
      reason: result.error?.message || (result.signal ? `signal-${result.signal}` : `exit-${result.status}`),
      runnerExit: result.status,
      planHash: manifest.planHash,
      head: manifest.headSha,
      base: manifest.mutationBaseSha,
      scopes: shard.scopes,
    };

    writeJson(path.join(output, 'summary.json'), summary);

    return { exitCode: 2, summary };
  }

  const reportFile = path.join(output, 'mutation.json');

  fs.copyFileSync(reportSource, reportFile);
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const mutation = summarizeMutationReport(report);
  const details = unacceptableMutants(report);
  const outcome = classifyShardResult(result.status, mutation);

  const summary = {
    status: outcome.status,
    ...(outcome.reason ? { reason: outcome.reason } : {}),
    shard: shard.id,
    changedLines: shard.changedLines,
    ...mutation,
    unacceptableMutants: details,
    runnerExit: result.status,
    planHash: manifest.planHash,
    head: manifest.headSha,
    base: manifest.mutationBaseSha,
    scopes: shard.scopes,
  };

  writeJson(path.join(output, 'summary.json'), summary);

  return { exitCode: outcome.exitCode, summary };
}

export function aggregateMutation(manifest, summaries) {
  const byShard = new Map(summaries.map((summary) => [summary.shard, summary]));
  const missingShards = manifest.shards.map((shard) => shard.id).filter((id) => !byShard.has(id));

  const duplicateShards = summaries
    .map((summary) => summary.shard)
    .filter((id, index, ids) => ids.indexOf(id) !== index);

  const invalidShards = summaries.flatMap((summary) => {
    const shard = manifest.shards.find((candidate) => candidate.id === summary.shard);

    const runnerExitValid = shard?.scopes.length === 0
      ? summary.runnerExit === undefined || summary.runnerExit === 0
      : summary.runnerExit === 0;

    const valid = shard
      && summary.planHash === manifest.planHash
      && summary.head === manifest.headSha
      && summary.base === manifest.mutationBaseSha
      && JSON.stringify(summary.scopes) === JSON.stringify(shard.scopes)
      && runnerExitValid;

    return valid ? [] : [summary.shard ?? 'unknown'];
  });

  const statuses = {};
  const unacceptableMutants = [];
  let total = 0;

  for (const summary of summaries) {
    total += summary.total ?? 0;

    for (const [status, count] of Object.entries(summary.statuses ?? {})) {
      statuses[status] = (statuses[status] ?? 0) + count;
    }

    unacceptableMutants.push(...(summary.unacceptableMutants ?? []).map((mutant) => ({
      shard: summary.shard,
      ...mutant,
    })));
  }

  const runnerFailed = (summary) => summary.runnerExit !== undefined && summary.runnerExit !== 0;

  const failedShards = summaries
    .filter((summary) => runnerFailed(summary)
      || ['failed', 'error', 'refused'].includes(summary.status))
    .map((summary) => ({
      shard: summary.shard,
      status: runnerFailed(summary) ? 'error' : summary.status,
      reason: summary.reason ?? (runnerFailed(summary)
        ? `exit-${summary.runnerExit}`
        : null),
    }));

  const passed = missingShards.length === 0
    && duplicateShards.length === 0
    && invalidShards.length === 0
    && failedShards.length === 0
    && unacceptableMutants.length === 0;

  return {
    status: passed ? (total === 0 ? 'skipped' : 'passed') : 'failed',
    passed,
    authority: manifest.authority,
    base: manifest.mutationBaseSha,
    mergeBase: manifest.mergeBaseSha,
    reviewedSha: manifest.reviewedSha,
    head: manifest.headSha,
    changedLines: manifest.changedLines,
    files: manifest.files,
    ranges: manifest.ranges,
    shardCount: manifest.shards.length,
    total,
    statuses,
    missingShards,
    duplicateShards: [...new Set(duplicateShards)],
    invalidShards: [...new Set(invalidShards)],
    failedShards,
    unacceptableMutants,
  };
}

export function renderSummary(summary) {
  const lines = [
    '# Changed-code mutation',
    '',
    `- authority: ${summary.authority}`,
    `- base: \`${summary.base}\``,
    `- merge-base: \`${summary.mergeBase}\``,
    `- reviewed SHA: ${summary.reviewedSha ? `\`${summary.reviewedSha}\`` : 'none'}`,
    `- head: \`${summary.head}\``,
    `- scope: ${summary.changedLines} production line(s), ${summary.shardCount} shard(s)`,
    `- result: **${summary.status}**`,
    `- totals: ${JSON.stringify(summary.statuses)}`,
  ];

  if (summary.missingShards.length) lines.push('', `Missing shards: ${summary.missingShards.join(', ')}`);
  if (summary.duplicateShards.length) lines.push('', `Duplicate shards: ${summary.duplicateShards.join(', ')}`);
  if (summary.invalidShards.length) lines.push('', `Invalid shard authority: ${summary.invalidShards.join(', ')}`);
  if (summary.failedShards.length) lines.push('', ...summary.failedShards.map((shard) => `- shard ${shard.shard}: ${shard.status} (${shard.reason ?? 'mutants rejected'})`));

  if (summary.unacceptableMutants.length) {
    lines.push('', '## Unacceptable mutants', '');

    for (const mutant of summary.unacceptableMutants) {
      const original = mutant.original === null
        ? ''
        : ` \`${String(mutant.original).replaceAll('`', '\\`')}\``;

      const replacement = mutant.replacement === null
        ? ''
        : ` → \`${String(mutant.replacement).replaceAll('`', '\\`')}\``;

      lines.push(
        `- \`${mutant.file}:${mutant.line ?? '?'}\` — ${mutant.status}`
        + ` / ${mutant.mutator} (shard ${mutant.shard})${original}${replacement}`
        + `${mutant.reason ? ` — ${mutant.reason}` : ''}`,
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 2) {
    if (!rest[index]?.startsWith('--') || rest[index + 1] === undefined) throw new Error(`Unknown or incomplete argument: ${rest[index]}`);
    options[rest[index].slice(2)] = rest[index + 1];
  }

  return { command, options };
}

function readJson(file, fallback) {
  return file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
}

function findSummaries(root) {
  const files = [];

  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.name === 'summary.json') files.push(file);
    }
  };

  if (fs.existsSync(root)) visit(root);

  return files.map((file) => readJson(file));
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  if (command === 'plan') {
    const manifest = planMutation(root, {
      base: options.base,
      head: options.head,
      reviews: readJson(options.reviews, []),
      checkpoints: readJson(options.checkpoints, { check_runs: [] }).check_runs ?? [],
      targetLines: Number(options['target-lines'] ?? 100),
    });

    writeJson(options.output, manifest);
    const matrix = { include: manifest.shards.map((shard) => ({ shard: shard.id })) };

    process.stdout.write(`${JSON.stringify(matrix)}\n`);

    return;
  }

  if (command === 'run-shard') {
    const result = runShard(
      root,
      readJson(options.manifest),
      options.shard,
      path.resolve(options.output),
    );

    process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
    process.exitCode = result.exitCode;

    return;
  }

  if (command === 'aggregate') {
    const manifest = readJson(options.manifest);
    const summary = aggregateMutation(manifest, findSummaries(options.shards));

    writeJson(options.output, summary);
    if (options.markdown) fs.writeFileSync(options.markdown, renderSummary(summary));
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    process.exitCode = summary.passed ? 0 : 1;

    return;
  }

  throw new Error('Expected plan, run-shard, or aggregate.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
