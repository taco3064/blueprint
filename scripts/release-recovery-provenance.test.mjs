import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { recoveryProvenanceStatement, signRecoveryProvenance } from './release-recovery-provenance.mjs';

const bytes = Buffer.from('the original packed candidate');

const recovery = {
  manifest: {
    repository: 'taco3064/blueprint',
    headSha: 'a'.repeat(40),
    version: '4.1.0',
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    workflowRunId: 123,
    workflowUrl: 'https://github.com/taco3064/blueprint/actions/runs/123',
  },
  toolSha: 'b'.repeat(40),
  artifact: { id: 456 },
  tag: 'v4.1.0',
};

const env = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'taco3064/blueprint',
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_WORKFLOW_REF: 'taco3064/blueprint/.github/workflows/release.yml@refs/heads/main',
  GITHUB_SHA: recovery.toolSha,
  GITHUB_WORKFLOW_SHA: recovery.toolSha,
  RUNNER_ENVIRONMENT: 'github-hosted',
  GITHUB_RUN_ID: '789',
  GITHUB_RUN_ATTEMPT: '2',
  GITHUB_REPOSITORY_ID: '42',
  GITHUB_REPOSITORY_OWNER_ID: '43',
  ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'ambient-token',
};

describe('recovery provenance', () => {
  it('binds the npm package bytes while distinguishing source, signing tooling, and original CI artifact', () => {
    const statement = recoveryProvenanceStatement(recovery, bytes, env);
    const { buildDefinition, runDetails } = statement.predicate;

    expect(statement.subject).toEqual([{
      name: 'pkg:npm/%40kekkai/blueprint@4.1.0',
      digest: { sha512: crypto.createHash('sha512').update(bytes).digest('hex') },
    }]);

    expect(buildDefinition.resolvedDependencies).toEqual([
      {
        uri: `git+${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}@${env.GITHUB_REF}`,
        digest: { gitCommit: env.GITHUB_SHA },
      },
      {
        uri: `git+https://github.com/taco3064/blueprint@${recovery.manifest.headSha}`,
        digest: { gitCommit: recovery.manifest.headSha },
      },
      {
        uri: `${recovery.manifest.workflowUrl}/artifacts/456#kekkai-blueprint-4.1.0.tgz`,
        digest: { sha256: recovery.manifest.sha256 },
      },
    ]);

    expect(buildDefinition.externalParameters.recovery).toEqual({
      operation: 'publish-existing-ci-artifact', tag: 'v4.1.0', candidateRun: recovery.manifest.workflowUrl,
    });

    expect(runDetails.metadata.invocationId).toBe('https://github.com/taco3064/blueprint/actions/runs/789/attempts/2');
  });

  it.each([
    ['GITHUB_ACTIONS', 'false'],
    ['GITHUB_REPOSITORY', 'attacker/blueprint'],
    ['GITHUB_SERVER_URL', 'https://example.com'],
    ['GITHUB_EVENT_NAME', 'push'],
    ['GITHUB_REF', 'refs/heads/other'],
    ['GITHUB_WORKFLOW_REF', 'taco3064/blueprint/.github/workflows/other.yml@refs/heads/main'],
    ['GITHUB_SHA', recovery.manifest.headSha],
    ['GITHUB_WORKFLOW_SHA', recovery.manifest.headSha],
    ['RUNNER_ENVIRONMENT', 'self-hosted'],
    ['GITHUB_RUN_ID', ''],
    ['GITHUB_RUN_ATTEMPT', '0'],
    ['GITHUB_REPOSITORY_ID', undefined],
    ['GITHUB_REPOSITORY_OWNER_ID', 'invalid'],
  ])('rejects incompatible signing environment %s', (key, value) => {
    expect(() => recoveryProvenanceStatement(recovery, bytes, { ...env, [key]: value })).toThrow();
  });

  it.each([
    ['repository', 'attacker/blueprint'],
    ['headSha', 'short'],
    ['version', '4.1.0-preview'],
    ['workflowRunId', 0],
    ['workflowUrl', 'https://github.com/taco3064/blueprint/actions/runs/999'],
    ['sha256', '0'.repeat(64)],
  ])('rejects incompatible candidate %s', (key, value) => {
    const modified = { ...recovery, manifest: { ...recovery.manifest, [key]: value } };

    expect(() => recoveryProvenanceStatement(modified, bytes, env)).toThrow();
  });

  it.each([
    { tag: 'v4.2.0' }, { toolSha: 'short' }, { artifact: {} },
  ])('rejects malformed recovery metadata %j', (override) => {
    expect(() => recoveryProvenanceStatement({ ...recovery, ...override }, bytes, env)).toThrow();
  });

  it('rejects changed tarball bytes', () => {
    expect(() => recoveryProvenanceStatement(recovery, Buffer.from('rebuilt'), env)).toThrow(/digest changed/);
  });

  function signer() {
    return {
      attest: vi.fn(async (payload, payloadType) => ({ dsseEnvelope: { payload: payload.toString('base64'), payloadType } })),
      verify: vi.fn(async () => {}),
    };
  }

  it('verifies the actual recovery workflow signer and SHA before returning the bundle', async () => {
    const sigstore = signer();
    const bundle = await signRecoveryProvenance(recovery, bytes, env, sigstore);

    expect(sigstore.attest).toHaveBeenCalledWith(expect.any(Buffer), 'application/vnd.in-toto+json', {
      legacyCompatibility: true, tlogUpload: true,
    });

    expect(sigstore.verify).toHaveBeenCalledWith(bundle, {
      certificateIssuer: 'https://token.actions.githubusercontent.com',
      certificateIdentityURI: '^https://github\\.com/taco3064/blueprint/\\.github/workflows/release\\.yml@refs/heads/main$',
      certificateOIDs: { '1.3.6.1.4.1.57264.1.3': recovery.toolSha },
    });
  });

  it.each([
    { ACTIONS_ID_TOKEN_REQUEST_URL: '' },
    { ACTIONS_ID_TOKEN_REQUEST_TOKEN: '' },
    { SIGSTORE_ID_TOKEN: 'substitute' },
  ])('refuses signing without GitHub ambient identity %j', async (override) => {
    const sigstore = signer();

    await expect(signRecoveryProvenance(recovery, bytes, { ...env, ...override }, sigstore)).rejects.toThrow(/ambient OIDC/);
    expect(sigstore.attest).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { dsseEnvelope: { payloadType: 'other' } },
    { dsseEnvelope: { payloadType: 'application/vnd.in-toto+json', payload: Buffer.from('{}').toString('base64') } },
  ])('rejects a substituted signed statement %j', async (bundle) => {
    const sigstore = signer();

    sigstore.attest.mockResolvedValue(bundle);
    await expect(signRecoveryProvenance(recovery, bytes, env, sigstore)).rejects.toThrow(/exact recovery statement/);
    expect(sigstore.verify).not.toHaveBeenCalled();
  });

  it('propagates cryptographic or signer verification failure', async () => {
    const sigstore = signer();

    sigstore.verify.mockRejectedValue(new Error('certificate identity rejected'));
    await expect(signRecoveryProvenance(recovery, bytes, env, sigstore)).rejects.toThrow('certificate identity rejected');
  });
});
