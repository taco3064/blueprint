import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveCandidate, selectCandidateArtifact, validateCandidateRun } from './field-candidate.mjs';

const scripts = path.dirname(fileURLToPath(import.meta.url));

export function validateRecoveryIdentity({ manifest, sha, runId, tag, run, toolSha }) {
  if (!/^[0-9a-f]{40}$/.test(sha) || !/^[0-9a-f]{40}$/.test(toolSha)
    || !/^[1-9][0-9]*$/.test(String(runId))) throw new Error('Recovery requires full candidate/tool SHAs and a numeric CI run.');
  if (manifest.repository !== 'taco3064/blueprint' || manifest.headSha !== sha
    || String(manifest.workflowRunId) !== String(runId)) throw new Error('Recovery candidate identity mismatch.');

  if (!/^\d+\.\d+\.\d+$/.test(manifest.version) || tag !== `v${manifest.version}`) {
    throw new Error('Recovery tag must match the stable candidate package version.');
  }

  if (manifest.tarball !== `kekkai-blueprint-${manifest.version}.tgz`) {
    throw new Error('Recovery requires the CI package tarball filename.');
  }

  validateCandidateRun(manifest, run);
  if (run.path !== '.github/workflows/ci.yml') throw new Error('Recovery requires the repository CI workflow.');

  return true;
}

export function verifyRecovery(record, { run, resolve = resolveCandidate }) {
  const api = (endpoint) => JSON.parse(run('gh', ['api', endpoint]));
  const { manifest, toolSha, tag } = record;

  validateRecoveryIdentity({
    manifest, sha: manifest.headSha, runId: manifest.workflowRunId, toolSha, tag,
    run: api(`repos/${manifest.repository}/actions/runs/${manifest.workflowRunId}`),
  });

  if (run('git', ['rev-parse', 'HEAD']).trim() !== toolSha) throw new Error('Recovery tooling SHA changed.');
  run('git', ['merge-base', '--is-ancestor', manifest.headSha, toolSha]);
  const candidate = resolve(record.manifestFile);

  if (JSON.stringify(candidate.manifest) !== JSON.stringify(manifest)
    || candidate.artifact.id !== record.artifact.id
    || path.resolve(record.tarball)
    !== path.resolve(path.dirname(record.manifestFile), manifest.tarball)) {
    throw new Error('Recovery artifact changed.');
  }

  const remoteTags = run('git', ['ls-remote', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`]).trim();
  const refs = remoteTags ? remoteTags.split('\n').map((line) => line.split(/\s+/)) : [];
  const target = refs.find(([, ref]) => ref.endsWith('^{}')) ?? refs[0];

  if (target && target[0] !== manifest.headSha) throw new Error('Existing release tag points to another candidate.');

  if (run('git', ['rev-parse', 'HEAD'], { cwd: record.checkout }).trim() !== manifest.headSha) {
    throw new Error('Recovery checkout is not the field candidate.');
  }

  if (run('git', ['status', '--porcelain'], { cwd: record.checkout }).trim()) {
    throw new Error('Recovery candidate checkout is dirty.');
  }

  run(process.execPath, [path.join(scripts, 'release-changeset-gate.mjs')], { cwd: record.checkout });
  run(process.execPath, [path.join(scripts, 'release-field-gate.mjs')], { cwd: record.checkout });

  return candidate;
}

export function prepareRecovery({ sha, runId, tag, directory }, adapters = {}) {
  const run = adapters.run ?? ((file, args, options = {}) => execFileSync(file, args, {
    encoding: 'utf8', ...options,
  }));

  const api = (endpoint) => JSON.parse(run('gh', ['api', endpoint]));
  const toolSha = run('git', ['rev-parse', 'HEAD']).trim();
  const locator = { repository: 'taco3064/blueprint', headSha: sha, workflowRunId: runId };

  if (!/^[0-9a-f]{40}$/.test(sha) || !/^[1-9][0-9]*$/.test(String(runId))) {
    throw new Error('Recovery requires a full candidate SHA and numeric CI run.');
  }

  const workflow = api(`repos/taco3064/blueprint/actions/runs/${runId}`);

  validateCandidateRun(locator, workflow);
  if (workflow.path !== '.github/workflows/ci.yml') throw new Error('Recovery requires the repository CI workflow.');
  const artifact = selectCandidateArtifact(locator, api(`repos/taco3064/blueprint/actions/runs/${runId}/artifacts?per_page=100`));
  const download = path.join(directory, 'artifact');

  fs.mkdirSync(download, { recursive: true });
  run('gh', ['run', 'download', String(runId), '--repo', locator.repository, '--name', artifact.name, '--dir', download]);
  const manifestFile = path.join(download, 'candidate.json');
  const candidate = (adapters.resolve ?? resolveCandidate)(manifestFile);
  const { manifest } = candidate;

  validateRecoveryIdentity({ manifest, sha, runId, tag, run: workflow, toolSha });
  run('git', ['merge-base', '--is-ancestor', sha, toolSha]);
  const checkout = path.join(directory, 'candidate');

  run('git', ['worktree', 'add', '--detach', checkout, sha]);

  const record = {
    manifest, manifestFile, tarball: path.resolve(download, manifest.tarball),
    artifact, toolSha, tag, checkout,
  };

  verifyRecovery(record, { run, resolve: adapters.resolve });

  fs.writeFileSync(path.join(directory, 'release-notes.md'), run(process.execPath, [
    path.join(scripts, 'changelog-section.mjs'), manifest.version, path.join(checkout, 'CHANGELOG.md'),
  ]));

  fs.writeFileSync(path.join(directory, 'recovery.json'), `${JSON.stringify(record, null, 2)}\n`);

  return record;
}

function main() {
  if (process.env.GITHUB_REPOSITORY !== 'taco3064/blueprint'
    || process.env.GITHUB_REF !== 'refs/heads/main'
    || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    throw new Error('Release recovery must run from the repository main workflow_dispatch.');
  }

  const directory = path.join(process.env.RUNNER_TEMP, 'blueprint-release-recovery');
  const run = (file, args, options = {}) => execFileSync(file, args, { encoding: 'utf8', ...options });

  if (run('git', ['rev-parse', 'HEAD']).trim() !== process.env.GITHUB_SHA) {
    throw new Error('Recovery checkout does not match the executing workflow SHA.');
  }

  if (run('git', ['status', '--porcelain']).trim()) {
    throw new Error('Recovery tooling checkout is dirty.');
  }

  if (process.argv[2] === 'verify') {
    verifyRecovery(JSON.parse(fs.readFileSync(path.join(directory, 'recovery.json'), 'utf8')), { run });
  } else if (process.argv[2] === 'prepare') {
    prepareRecovery({
      sha: process.env.CANDIDATE_SHA, runId: process.env.CANDIDATE_RUN_ID,
      tag: process.env.RELEASE_TAG, directory,
    });
  } else {
    throw new Error('Expected prepare or verify.');
  }

  process.stdout.write(`Recovery candidate verified; publisher tooling remains ${process.env.GITHUB_SHA}.\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
