import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function git(root, args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8' });
}

function commit(root, ref) {
  const result = git(root, ['rev-parse', '--verify', `${ref}^{commit}`]);

  if (result.status !== 0) throw new Error(`Cannot resolve commit ${ref}: ${(result.stderr || result.stdout).trim()}`);

  return result.stdout.trim();
}

export function conflictPaths(output) {
  const paths = new Set();

  for (const line of output.split('\n')) {
    const conflict = /CONFLICT .* in (.+)$/.exec(line);
    const staged = /^\d{6} [0-9a-f]+ [123]\t(.+)$/.exec(line);

    if (conflict) paths.add(conflict[1]);
    if (staged) paths.add(staged[1]);
  }

  return [...paths].sort();
}

export function inspectIntegration(root, { event, base, head, candidate = null }) {
  const headSha = commit(root, head);

  if (event === 'push') {
    const treeSha = git(root, ['rev-parse', `${headSha}^{tree}`]).stdout.trim();

    return {
      event,
      headSha,
      baseHeadSha: headSha,
      mergeBaseSha: headSha,
      integrationTreeSha: treeSha,
      candidateCommitSha: headSha,
      mergeable: true,
      conflicts: [],
    };
  }

  if (event !== 'pull_request') throw new Error(`Unsupported CI preflight event: ${event}`);

  const baseHeadSha = commit(root, base);
  const mergeBase = git(root, ['merge-base', baseHeadSha, headSha]);

  if (mergeBase.status !== 0) {
    return {
      event,
      headSha,
      baseHeadSha,
      mergeBaseSha: null,
      integrationTreeSha: null,
      mergeable: false,
      conflicts: [],
      reason: (mergeBase.stderr || mergeBase.stdout || 'no merge base').trim(),
    };
  }

  const merge = git(root, ['merge-tree', '--write-tree', baseHeadSha, headSha]);
  const output = `${merge.stdout}\n${merge.stderr}`.trim();
  const conflicts = conflictPaths(output);

  const integrationTreeSha = merge.status === 0 ? merge.stdout.trim().split('\n')[0] : null;
  const candidateCommitSha = merge.status === 0 && candidate ? commit(root, candidate) : null;

  const candidateTreeSha = candidateCommitSha
    ? git(root, ['rev-parse', `${candidateCommitSha}^{tree}`]).stdout.trim()
    : null;

  const candidateMatches = merge.status !== 0
    || !candidate
    || candidateTreeSha === integrationTreeSha;

  return {
    event,
    headSha,
    baseHeadSha,
    mergeBaseSha: mergeBase.stdout.trim(),
    integrationTreeSha,
    candidateCommitSha,
    mergeable: merge.status === 0 && candidateMatches,
    conflicts,
    ...(merge.status !== 0
      ? { reason: output || `git merge-tree exited ${merge.status}` }
      : candidateMatches ? {} : { reason: `Candidate tree ${candidateTreeSha} does not match computed integration tree ${integrationTreeSha}.` }),
  };
}

export function githubOutputs(result) {
  return [
    `head_sha=${result.headSha}`,
    `base_head_sha=${result.baseHeadSha}`,
    `merge_base_sha=${result.mergeBaseSha ?? ''}`,
    `integration_tree_sha=${result.integrationTreeSha ?? ''}`,
    `candidate_sha=${result.candidateCommitSha ?? ''}`,
    `mergeable=${result.mergeable}`,
  ].join('\n') + '\n';
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];

    if (!key?.startsWith('--') || value === undefined) throw new Error(`Unknown or incomplete argument: ${key}`);
    options[key.slice(2)] = value;
  }

  if (!options.event || !options.head || !options.output) {
    throw new Error('--event, --head, and --output are required.');
  }

  if (options.event === 'pull_request' && !options.base) {
    throw new Error('--base is required for pull_request.');
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = inspectIntegration(process.cwd(), options);
  const output = path.resolve(options.output);

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, githubOutputs(result));
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (!result.mergeable) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
