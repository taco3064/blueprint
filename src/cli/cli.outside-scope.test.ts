import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { run } from './cli';

let parent: string;
let root: string;

function write(file: string, content: string): void {
  const target = path.join(root, file);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

async function inspect(...flags: string[]) {
  const code = await run(['inspect', '--json', ...flags], root);
  const calls = vi.mocked(console.log).mock.calls;
  const report = JSON.parse(String(calls.at(-1)?.[0]));

  return { code, report };
}

beforeEach(() => {
  parent = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-outside-scope-'));
  root = path.join(parent, 'app');
  fs.mkdirSync(root);
  write('package.json', JSON.stringify({ name: 'scope-fixture', dependencies: { react: '^19' } }));

  write('blueprint.config.mjs', `export default ${JSON.stringify({
    framework: 'react',
    architecture: {
      alias: '~app', sourceRoot: 'src', additionalAliases: { '@outside': 'ignored' },
      modules: [{ name: 'auth', does: 'authentication' }],
      layers: [{ name: 'components', does: 'UI' }],
    },
  })};`);

  write('.gitignore', 'ignored/\n');
  expect(spawnSync('git', ['init', '-q'], { cwd: root }).status).toBe(0);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(parent, { recursive: true, force: true });
});

describe('CLI outside-scope evidence', () => {
  it('keeps ignored invalid code outside the inventory for template import text', async () => {
    write('src/auth/index.ts', 'export const sample = `import \'@outside/run\';`;');
    write('ignored/run.ts', 'const = ;');

    const { code, report } = await inspect();

    expect(code).toBe(0);
    expect(report.ok).toBe(true);

    expect(report.outsideScope).toMatchObject({
      status: 'complete', inventoryFiles: 1, readFiles: 1, parsedFiles: 1,
      directoryWalks: 0, limitations: [],
      contributions: { repositoryVisible: 1, explicitConsumerRoot: 0, governedReference: 0 },
    });

    expect(report.findings.filter((finding: { rule: string }) =>
      finding.rule === 'uncovered-application-source')).toEqual([]);

    expect(console.error).not.toHaveBeenCalled();
  });

  it('reports a real import into the ignored tree', async () => {
    write('src/auth/index.ts', 'import \'@outside/run\';');
    write('ignored/run.ts', 'export const run = 1;');

    const { code, report } = await inspect();

    expect(code).toBe(1);

    expect(report.outsideScope).toMatchObject({
      status: 'complete', inventoryFiles: 2, readFiles: 2, parsedFiles: 2,
      directoryWalks: 1, limitations: [],
      contributions: { repositoryVisible: 1, explicitConsumerRoot: 0, governedReference: 1 },
    });

    expect(report.findings.filter((finding: { rule: string }) =>
      finding.rule === 'uncovered-application-source').map((finding: { subject: string }) =>
      finding.subject)).toEqual(['ignored']);
  });

  it('refuses baseline acceptance and replacement for an escaping directory link', async () => {
    write('src/auth/index.ts', 'import \'@outside/run\';');
    const outside = path.join(parent, 'external');

    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'run.ts'), 'export const run = 1;');
    fs.symlinkSync(outside, path.join(root, 'ignored'), 'junction');

    const { code, report } = await inspect('--baseline');

    expect(code).toBe(1);
    expect(report.ok).toBe(false);

    expect(report.outsideScope).toMatchObject({
      status: 'partial', directoryWalks: 0,
      limitations: [
        'ignored: directory resolves outside the application root',
        'src/auth/index.ts: unresolved project reference ignored/run',
      ],
    });

    const ledger = 'user-owned baseline sentinel';

    write('.blueprint-baseline.json', ledger);
    expect(await run(['inspect', '--update-baseline'], root)).toBe(1);
    expect(fs.readFileSync(path.join(root, '.blueprint-baseline.json'), 'utf-8')).toBe(ledger);
    expect(console.error).not.toHaveBeenCalled();
  });
});
