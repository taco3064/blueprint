import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  packCandidate,
  resolveCandidate,
  selectCandidateArtifact,
  verifyCandidate,
  verifyCandidateMatch,
} from './field-candidate.mjs';

function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-candidate-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

  git('init', '-q');
  git('config', 'user.name', 'Blueprint Test');
  git('config', 'user.email', 'blueprint@example.test');

  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: '@kekkai/blueprint',
    version: '4.0.0',
    files: ['dist'],
  }));

  fs.writeFileSync(path.join(root, '.gitignore'), 'dist/\n');
  git('add', '.');
  git('commit', '-qm', 'candidate');
  fs.mkdirSync(path.join(root, 'dist'));
  fs.writeFileSync(path.join(root, 'dist', 'index.js'), 'export const candidate = "trusted"\n');

  return { root, git };
}

describe('field candidate artifact', () => {
  it('packs and verifies one clean exact main candidate', () => {
    const { root, git } = repository();
    const head = git('rev-parse', 'HEAD');

    const environment = {
      GITHUB_REPOSITORY: 'taco3064/blueprint',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_EVENT_NAME: 'push',
      GITHUB_RUN_ID: '42',
      GITHUB_SERVER_URL: 'https://github.com',
    };

    const manifest = packCandidate(root, 'candidate', head, environment);
    const verified = verifyCandidate(path.join(root, 'candidate', 'candidate.json'));

    expect(manifest).toMatchObject({
      headSha: head,
      version: '4.0.0',
      event: 'push',
      ref: 'refs/heads/main',
      workflowRunId: '42',
    });

    expect(verified.tarball).toBe(path.join(root, 'candidate', manifest.tarball));
  });

  it('rejects a dirty or mismatched checkout before packing', () => {
    const { root, git } = repository();
    const head = git('rev-parse', 'HEAD');

    expect(() => packCandidate(root, 'candidate', 'a'.repeat(40), {})).toThrow(/does not match/);
    fs.writeFileSync(path.join(root, 'dirty.txt'), 'dirty\n');
    expect(() => packCandidate(root, 'candidate', head, {})).toThrow(/clean/);
  });

  it('rejects tampered tarball and non-main provenance', () => {
    const { root, git } = repository();
    const head = git('rev-parse', 'HEAD');

    const manifest = packCandidate(root, 'candidate', head, {
      GITHUB_REF: 'refs/heads/main',
      GITHUB_EVENT_NAME: 'push',
    });

    const manifestFile = path.join(root, 'candidate', 'candidate.json');

    fs.writeFileSync(manifestFile, JSON.stringify({ ...manifest, ref: 'refs/heads/feature' }));
    expect(() => verifyCandidate(manifestFile)).toThrow(/push to refs\/heads\/main/);

    fs.writeFileSync(manifestFile, JSON.stringify({ ...manifest, repository: 'fork/blueprint' }));
    expect(() => verifyCandidate(manifestFile)).toThrow(/release authority/);

    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    fs.appendFileSync(path.join(root, 'candidate', manifest.tarball), 'tampered');
    expect(() => verifyCandidate(manifestFile)).toThrow(/SHA-256/);
  });

  it('resolves the unique workflow artifact and rejects a repacked ignored dist', () => {
    const { root, git } = repository();
    const head = git('rev-parse', 'HEAD');

    const environment = {
      GITHUB_REPOSITORY: 'taco3064/blueprint',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_EVENT_NAME: 'push',
      GITHUB_RUN_ID: '42',
      GITHUB_SERVER_URL: 'https://github.com',
    };

    const trustedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-trusted-'));
    const substitutedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-substituted-'));

    packCandidate(root, trustedDirectory, head, environment);
    fs.writeFileSync(path.join(root, 'dist', 'index.js'), 'export const candidate = "substituted"\n');
    packCandidate(root, substitutedDirectory, head, environment);

    const trustedManifest = path.join(trustedDirectory, 'candidate.json');
    const substitutedManifest = path.join(substitutedDirectory, 'candidate.json');

    expect(() => verifyCandidateMatch(substitutedManifest, trustedManifest)).toThrow(/exact artifact/);

    const artifact = { id: 7, name: `blueprint-candidate-${head}`, expired: false };
    const resolvedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-resolved-'));

    expect(resolveCandidate(trustedManifest, {
      directory: resolvedDirectory,
      fetchJson: (endpoint) => endpoint.endsWith('/artifacts?per_page=100')
        ? { total_count: 1, artifacts: [artifact] }
        : {
            id: 42,
            event: 'push',
            head_branch: 'main',
            head_sha: head,
            status: 'completed',
            conclusion: 'success',
          },
      downloadArtifact: ({ directory }) => {
        const manifest = JSON.parse(fs.readFileSync(trustedManifest, 'utf8'));

        fs.copyFileSync(trustedManifest, path.join(directory, 'candidate.json'));

        fs.copyFileSync(
          path.join(trustedDirectory, manifest.tarball),
          path.join(directory, manifest.tarball),
        );
      },
    })).toMatchObject({
      artifact,
      artifactUrl: `https://github.com/taco3064/blueprint/actions/runs/42/artifacts/7`,
    });

    const duplicateArtifacts = { total_count: 2, artifacts: [artifact, { ...artifact, id: 8 }] };

    expect(() => selectCandidateArtifact({ headSha: head }, duplicateArtifacts))
      .toThrow(/exactly one/);

    const expiredArtifact = { total_count: 1, artifacts: [{ ...artifact, expired: true }] };

    expect(() => selectCandidateArtifact({ headSha: head }, expiredArtifact))
      .toThrow(/expired/);

    const incompleteInventory = { total_count: 2, artifacts: [artifact] };

    expect(() => selectCandidateArtifact({ headSha: head }, incompleteInventory))
      .toThrow(/inventory is incomplete/);
  });
});
