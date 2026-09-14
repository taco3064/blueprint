import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOWED_AFTER_RELEASE = [
  /^CHANGELOG\.md$/,
  /^\.github\//,
  /^\.agents\//,
  /^AGENTS\.md$/,
  /^scripts\/release-changeset-gate\.mjs$/,
  /^scripts\/release-changeset-gate\.test\.mjs$/,
];

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function versionAt(sha) {
  return JSON.parse(git(['show', `${sha}:package.json`])).version;
}

export function validateChangesetsRelease({
  version,
  releaseFiles,
  consumedChangesets,
  changelog,
  pendingChangesets,
  filesAfterRelease,
}) {
  for (const required of ['package.json', 'package-lock.json', 'CHANGELOG.md']) {
    if (!releaseFiles.includes(required)) {
      throw new Error(`Changesets release SHA did not change ${required}.`);
    }
  }

  if (consumedChangesets.length === 0) {
    throw new Error('Changesets release SHA consumed no .changeset/*.md entries.');
  }

  if (!new RegExp(`^## ${version.replaceAll('.', '\\.')}\\s*$`, 'm').test(changelog)) {
    throw new Error(`CHANGELOG.md has no section for ${version}.`);
  }

  if (pendingChangesets.length > 0) {
    throw new Error(`Unreleased changesets remain: ${pendingChangesets.join(', ')}`);
  }

  const disallowed = filesAfterRelease.filter(
    (file) => !ALLOWED_AFTER_RELEASE.some((pattern) => pattern.test(file)),
  );

  if (disallowed.length > 0) {
    throw new Error(
      `Publishable inputs changed after the Changesets release SHA: ${disallowed.join(', ')}`,
    );
  }

  return true;
}

export function findChangesetsReleaseSha({ head, version }) {
  const commits = git(['rev-list', head, '--', 'package.json'])
    .split('\n')
    .filter(Boolean);

  for (const sha of commits) {
    let parent;

    try {
      parent = git(['rev-parse', `${sha}^`]);
    } catch {
      continue;
    }

    if (versionAt(sha) === version && versionAt(parent) !== version) return sha;
  }

  throw new Error(`No Changesets version commit found for ${version}.`);
}

function ensureHistory() {
  if (git(['rev-parse', '--is-shallow-repository']) !== 'true') return;

  execFileSync('git', ['fetch', '--unshallow', 'origin'], { stdio: 'inherit' });
}

function main() {
  ensureHistory();

  const head = git(['rev-parse', 'HEAD^{commit}']);
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const releaseSha = findChangesetsReleaseSha({ head, version });

  execFileSync('git', ['merge-base', '--is-ancestor', releaseSha, head]);

  const releaseFiles = git(['diff', '--name-only', `${releaseSha}^`, releaseSha])
    .split('\n')
    .filter(Boolean);
  const consumedChangesets = git([
    'diff',
    '--diff-filter=D',
    '--name-only',
    `${releaseSha}^`,
    releaseSha,
  ])
    .split('\n')
    .filter((file) => /^\.changeset\/.*\.md$/.test(file));
  const filesAfterRelease = git(['diff', '--name-only', `${releaseSha}..${head}`])
    .split('\n')
    .filter(Boolean);
  const pendingChangesets = existsSync('.changeset')
    ? readdirSync('.changeset').filter((file) => file.endsWith('.md') && file !== 'README.md')
    : [];

  validateChangesetsRelease({
    version,
    releaseFiles,
    consumedChangesets,
    changelog: readFileSync('CHANGELOG.md', 'utf8'),
    pendingChangesets,
    filesAfterRelease,
  });

  process.stdout.write(`Changesets release SHA verified: ${releaseSha}\n`);
  process.stdout.write(`Tagged SHA: ${head}\n`);
  process.stdout.write(`Version: ${version}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
