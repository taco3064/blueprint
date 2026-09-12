import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_REPOSITORY = 'taco3064/blueprint';

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function packageJson(tarball) {
  return JSON.parse(execFileSync('tar', ['-xOf', tarball, 'package/package.json'], { encoding: 'utf8' }));
}

export function verifyCandidate(manifestFile) {
  const file = path.resolve(manifestFile);
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const tarball = path.resolve(path.dirname(file), manifest.tarball ?? '');

  if (manifest.schemaVersion !== 1) throw new Error('Unsupported candidate manifest schema.');
  if (manifest.repository !== EXPECTED_REPOSITORY) throw new Error('Candidate repository is not the Blueprint release authority.');
  if (!/^[0-9a-f]{40}$/.test(manifest.headSha ?? '')) throw new Error('Candidate headSha must be a full Git SHA.');

  if (manifest.event !== 'push' || manifest.ref !== 'refs/heads/main') {
    throw new Error('Field convergence candidates must come from a push to refs/heads/main.');
  }

  if (!fs.existsSync(tarball)) throw new Error(`Candidate tarball is missing: ${tarball}`);
  if (sha256(tarball) !== manifest.sha256) throw new Error('Candidate tarball SHA-256 does not match its manifest.');

  const packed = packageJson(tarball);

  if (packed.name !== '@kekkai/blueprint' || packed.version !== manifest.version) {
    throw new Error('Candidate package identity does not match its manifest.');
  }

  return { manifest, tarball };
}

export function packCandidate(root, output, expectedHead, environment = process.env) {
  const headSha = git(root, 'rev-parse', 'HEAD^{commit}');

  if (headSha !== expectedHead || !/^[0-9a-f]{40}$/.test(expectedHead)) {
    throw new Error(`Candidate checkout ${headSha} does not match expected main SHA ${expectedHead}.`);
  }

  if (git(root, 'status', '--porcelain')) throw new Error('Candidate checkout must be clean before npm pack.');

  const directory = path.resolve(root, output);

  fs.mkdirSync(directory, { recursive: true });

  const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', directory], {
    cwd: root,
    encoding: 'utf8',
  }))[0];

  const tarball = path.join(directory, packed.filename);
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

  const manifest = {
    schemaVersion: 1,
    repository: environment.GITHUB_REPOSITORY ?? EXPECTED_REPOSITORY,
    headSha,
    ref: environment.GITHUB_REF ?? 'refs/heads/main',
    event: environment.GITHUB_EVENT_NAME ?? 'push',
    version,
    tarball: packed.filename,
    sha256: sha256(tarball),
    workflowRunId: environment.GITHUB_RUN_ID ?? null,
    workflowUrl: environment.GITHUB_SERVER_URL
      && environment.GITHUB_REPOSITORY
      && environment.GITHUB_RUN_ID
      ? `${environment.GITHUB_SERVER_URL}/${environment.GITHUB_REPOSITORY}/actions/runs/${environment.GITHUB_RUN_ID}`
      : null,
  };

  fs.writeFileSync(path.join(directory, 'candidate.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  return manifest;
}

function parse(argv) {
  const [command, ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 2) {
    if (!rest[index]?.startsWith('--') || rest[index + 1] === undefined) throw new Error(`Unknown or incomplete argument: ${rest[index]}`);
    options[rest[index].slice(2)] = rest[index + 1];
  }

  return { command, options };
}

function main() {
  const { command, options } = parse(process.argv.slice(2));

  if (command === 'pack') {
    process.stdout.write(`${JSON.stringify(packCandidate(process.cwd(), options.output, options.head), null, 2)}\n`);

    return;
  }

  if (command === 'verify') {
    process.stdout.write(`${JSON.stringify(verifyCandidate(options.manifest).manifest, null, 2)}\n`);

    return;
  }

  throw new Error('Expected pack or verify.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
