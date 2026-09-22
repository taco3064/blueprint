import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { evidenceMarker } from './field-convergence.mjs';
import { validateReleaseEvidence } from './release-field-gate.mjs';

const script = fileURLToPath(new URL('./release-changeset-gate.mjs', import.meta.url));
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function repairedRelease() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-release-repair-'));

  roots.push(root);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const write = (file, content) => fs.writeFileSync(path.join(root, file), content);

  const commit = (message) => {
    git('add', '.');
    git('-c', 'core.hooksPath=', 'commit', '-qm', message);

    return git('rev-parse', 'HEAD');
  };

  git('init', '-q');
  git('config', 'user.name', 'Release Test');
  git('config', 'user.email', 'release@example.test');
  fs.mkdirSync(path.join(root, '.changeset'));
  write('package.json', '{"version":"4.0.0"}');
  write('package-lock.json', '{"version":"4.0.0"}');
  write('CHANGELOG.md', '# Releases\n');
  write('.changeset/feature.md', '---\n\'@kekkai/blueprint\': minor\n---\nFeature\n');
  commit('feature');
  write('package.json', '{"version":"4.1.0"}');
  write('package-lock.json', '{"version":"4.1.0"}');
  write('CHANGELOG.md', '# Releases\n\n## 4.1.0\n\nFeature\n');
  fs.unlinkSync(path.join(root, '.changeset/feature.md'));
  const versionSha = commit('prepare release');

  fs.mkdirSync(path.join(root, 'src'));
  write('src/cli.ts', 'export const fixed = true;\n');
  write('README.md', 'Repaired behavior\n');
  write('CHANGELOG.md', '# Releases\n\n## 4.1.0\n\nFeature and field repair\n');
  const repairedSha = commit('repair field finding');

  return { root, versionSha, repairedSha, write };
}

function fieldGate(sha, candidateSha) {
  const url = 'https://github.com/taco3064/blueprint/issues/521#issuecomment-123';

  return validateReleaseEvidence({
    repository: 'taco3064/blueprint',
    sha,
    combinedStatus: {
      statuses: [{ context: 'blueprint/field-convergence', state: 'success', target_url: url }],
    },
    ticket: { state: 'open' },
    comment: {
      html_url: url,
      body: evidenceMarker({
        candidateSha,
        scope: 'full',
        result: 'success',
        requiredScenarios: ['repeat-a/adopter', 'repeat-b/adopter'],
        scenarios: ['repeat-a/adopter', 'repeat-b/adopter'],
        findings: [],
        reportUrl: 'https://example.test/field-report',
      }),
    },
  });
}

describe('release after field repairs', () => {
  it('accepts product repairs after versioning only with the repaired SHA field evidence', () => {
    const { root, versionSha, repairedSha } = repairedRelease();
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Changesets release SHA verified: ${versionSha}`);
    expect(result.stdout).toContain(`Tagged SHA: ${repairedSha}`);
    expect(fieldGate(repairedSha, repairedSha).evidence.candidateSha).toBe(repairedSha);
    expect(() => fieldGate(repairedSha, versionSha)).toThrow(/different candidate SHA/);
  });

  it('still rejects pending changesets after a repair', () => {
    const { root, write } = repairedRelease();

    write('.changeset/next.md', '---\n\'@kekkai/blueprint\': patch\n---\nNext release\n');
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unreleased changesets remain: next.md');
  });
});
