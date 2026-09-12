import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FIELD_CONTEXT, parseEvidenceMarker } from './field-convergence.mjs';

export function validateReleaseEvidence({ repository, sha, combinedStatus, comment }) {
  const status = (combinedStatus.statuses ?? []).find((entry) => entry.context === FIELD_CONTEXT);

  if (!status) throw new Error(`No ${FIELD_CONTEXT} status exists for exact tag commit ${sha}.`);
  if (status.state !== 'success') throw new Error(`${FIELD_CONTEXT} for exact tag commit ${sha} is ${status.state}, not success.`);

  const target = new RegExp(`^https://github\\.com/${repository.replace('/', '\\/')}/issues/(\\d+)#issuecomment-(\\d+)$`)
    .exec(status.target_url ?? '');

  if (!target) throw new Error('Field convergence status does not link to a durable convergence-ticket comment.');

  const evidence = parseEvidenceMarker(comment.body);

  if (!evidence) throw new Error('Field convergence comment has no machine-readable evidence marker.');
  if (evidence.candidateSha !== sha) throw new Error('Field convergence comment belongs to a different candidate SHA.');

  if (evidence.scope !== 'full' || evidence.result !== 'success'
    || evidence.matrixComplete !== true || evidence.releaseBlockers !== 0) {
    throw new Error('Field convergence comment does not prove a successful complete full matrix.');
  }

  return { issue: Number(target[1]), comment: Number(target[2]), evidence };
}

function gh(args) {
  return JSON.parse(execFileSync('gh', ['api', ...args], { encoding: 'utf8' }));
}

function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const sha = execFileSync('git', ['rev-parse', 'HEAD^{commit}'], { encoding: 'utf8' }).trim();
  const combinedStatus = gh([`repos/${repository}/commits/${sha}/status`]);
  const status = (combinedStatus.statuses ?? []).find((entry) => entry.context === FIELD_CONTEXT);
  const target = /#issuecomment-(\d+)$/.exec(status?.target_url ?? '');

  if (!target) validateReleaseEvidence({ repository, sha, combinedStatus, comment: { body: '' } });

  const comment = gh([`repos/${repository}/issues/comments/${target[1]}`]);
  const result = validateReleaseEvidence({ repository, sha, combinedStatus, comment });

  process.stdout.write(`Field convergence verified for ${sha} at issue #${result.issue}, comment ${result.comment}.\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
