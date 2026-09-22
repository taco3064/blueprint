import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PAYLOAD_TYPE = 'application/vnd.in-toto+json';
const REPOSITORY = 'taco3064/blueprint';
const WORKFLOW = '.github/workflows/release.yml';

function requireMatch(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`Invalid ${label}.`);
}

export function recoveryProvenanceStatement(recovery, bytes, env) {
  const { manifest, toolSha, artifact, tag } = recovery;

  if (manifest.repository !== REPOSITORY || env.GITHUB_REPOSITORY !== REPOSITORY) {
    throw new Error('Recovery provenance repository does not match Blueprint.');
  }

  requireMatch(manifest.headSha, /^[a-f0-9]{40}$/, 'candidate SHA');
  requireMatch(toolSha, /^[a-f0-9]{40}$/, 'tool SHA');
  requireMatch(manifest.version, /^\d+\.\d+\.\d+$/, 'release version');
  requireMatch(String(manifest.workflowRunId), /^[1-9]\d*$/, 'candidate run');
  requireMatch(String(artifact?.id), /^[1-9]\d*$/, 'artifact ID');

  const repositoryUrl = `https://github.com/${REPOSITORY}`;
  const workflowRef = `${REPOSITORY}/${WORKFLOW}@refs/heads/main`;

  if (tag !== `v${manifest.version}` || manifest.workflowUrl !== `${repositoryUrl}/actions/runs/${manifest.workflowRunId}`) {
    throw new Error('Recovery tag or candidate workflow URL does not match its manifest.');
  }

  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_SERVER_URL !== 'https://github.com'
    || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_WORKFLOW_REF !== workflowRef || env.GITHUB_WORKFLOW_SHA !== toolSha
    || env.GITHUB_SHA !== toolSha || env.RUNNER_ENVIRONMENT !== 'github-hosted') {
    throw new Error('Provenance must run in the actual main recovery workflow at the verified tool SHA.');
  }

  for (const key of ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_REPOSITORY_ID', 'GITHUB_REPOSITORY_OWNER_ID']) {
    requireMatch(env[key], /^[1-9]\d*$/, key);
  }

  if (crypto.createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) {
    throw new Error('Recovery tarball digest changed before provenance signing.');
  }

  return {
    _type: 'https://in-toto.io/Statement/v1',
    subject: [{
      name: `pkg:npm/%40kekkai/blueprint@${manifest.version}`,
      digest: { sha512: crypto.createHash('sha512').update(bytes).digest('hex') },
    }],
    predicateType: 'https://slsa.dev/provenance/v1',
    predicate: {
      buildDefinition: {
        buildType: 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1',
        externalParameters: {
          workflow: { ref: 'refs/heads/main', repository: repositoryUrl, path: WORKFLOW },
          recovery: { operation: 'publish-existing-ci-artifact', tag, candidateRun: manifest.workflowUrl },
        },
        internalParameters: {
          github: {
            event_name: env.GITHUB_EVENT_NAME,
            repository_id: env.GITHUB_REPOSITORY_ID,
            repository_owner_id: env.GITHUB_REPOSITORY_OWNER_ID,
          },
        },
        resolvedDependencies: [
          { uri: `git+${repositoryUrl}@refs/heads/main`, digest: { gitCommit: toolSha } },
          { uri: `git+${repositoryUrl}@${manifest.headSha}`, digest: { gitCommit: manifest.headSha } },
          {
            uri: `${manifest.workflowUrl}/artifacts/${artifact.id}#kekkai-blueprint-${manifest.version}.tgz`,
            digest: { sha256: manifest.sha256 },
          },
        ],
      },
      runDetails: {
        builder: { id: 'https://github.com/actions/runner/github-hosted' },
        metadata: { invocationId: `${repositoryUrl}/actions/runs/${env.GITHUB_RUN_ID}/attempts/${env.GITHUB_RUN_ATTEMPT}` },
      },
    },
  };
}

export async function signRecoveryProvenance(recovery, bytes, env, sigstore) {
  const statement = recoveryProvenanceStatement(recovery, bytes, env);

  if (!env.ACTIONS_ID_TOKEN_REQUEST_URL
    || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || env.SIGSTORE_ID_TOKEN) {
    throw new Error('Recovery signing requires GitHub ambient OIDC without a substituted token.');
  }

  const payload = Buffer.from(JSON.stringify(statement));

  const bundle = await sigstore.attest(payload, PAYLOAD_TYPE, {
    legacyCompatibility: true, tlogUpload: true,
  });

  if (bundle.dsseEnvelope?.payloadType !== PAYLOAD_TYPE
    || bundle.dsseEnvelope.payload !== payload.toString('base64')) {
    throw new Error('Signed provenance does not contain the exact recovery statement.');
  }

  await sigstore.verify(bundle, {
    certificateIssuer: 'https://token.actions.githubusercontent.com',
    certificateIdentityURI: `^https://github\\.com/${REPOSITORY}/${WORKFLOW.replaceAll('.', '\\.')}@refs/heads/main$`,
    certificateOIDs: { '1.3.6.1.4.1.57264.1.3': recovery.toolSha },
  });

  return bundle;
}

async function main() {
  const [input, output, ...extra] = process.argv.slice(2);

  if (!input || !output || extra.length || !path.isAbsolute(process.env.SIGSTORE_MODULE ?? '')) {
    throw new Error('Usage: release-recovery-provenance.mjs <verified-recovery.json> <bundle.json>; set absolute SIGSTORE_MODULE.');
  }

  const recovery = JSON.parse(fs.readFileSync(input, 'utf8'));
  const bytes = fs.readFileSync(recovery.tarball);
  const sigstore = await import(pathToFileURL(process.env.SIGSTORE_MODULE).href);
  const bundle = await signRecoveryProvenance(recovery, bytes, process.env, sigstore);

  fs.writeFileSync(output, `${JSON.stringify(bundle, null, 2)}\n`, { flag: 'wx' });
  console.log(`Wrote verified recovery provenance to ${output}; publish the unchanged candidate with --provenance-file.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
