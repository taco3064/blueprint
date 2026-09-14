import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { vuePreset } from '../presets';
import { runDoctor } from './doctor';

let root: string;

const silent = () => {};

const load = async () => vuePreset();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-doctor-'));

  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'x', scripts: { lint: 'eslint .' }, dependencies: { vue: '^3' } }),
  );

  spawnSync('git', ['init'], { cwd: root });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const write = (rel: string, content = '') => {
  const full = path.join(root, rel);

  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
};

it('retains the legacy reference without declaring adoption complete', async () => {
  write('blueprint.config.mjs', 'export default {};');
  write('.eslintrc.cjs', 'module.exports = {};');
  write('eslint.config.blueprint.mjs', 'export default [];');
  const result = await runDoctor(root, { loadConfig: load, log: silent });
  const leftovers = result.checks.find((check) => check.label.includes('leftover'))!;

  expect(leftovers.ok).toBe(true);
  expect(leftovers.detail).toContain('retained as the legacy migration reference');
  expect(result.verdict).toBe('incomplete');
  expect(result.checks.find((check) => check.label === 'eslint wired to emitLint')?.ok).toBe(false);

  write('CLAUDE.blueprint.md', 'unmerged reference');
  const mixed = await runDoctor(root, { loadConfig: load, log: silent });

  expect(mixed.checks.find((check) => check.label.includes('leftover'))).toMatchObject({
    ok: false, detail: expect.stringContaining('merge and delete: CLAUDE.blueprint.md'),
  });
});

it.each([false, true])('checks root and application ledgers; stale=%s', async (stale) => {
  const { application, entry } = ledgerFixture(stale);
  const result = await runDoctor(application, { loadConfig: load, log: silent });
  const checks = result.checks.filter((check) => check.label.includes('suppressions'));

  expect(checks).toHaveLength(2);
  const ancestor = checks.find((check) => check.label.includes('../../eslint-suppressions.json'))!;

  expect(ancestor.ok).toBe(!stale);
  expect(ancestor.label).not.toContain('not in use');

  if (stale) {
    expect(ancestor.detail).toContain(entry);
  }
});

function ledgerFixture(stale: boolean): { application: string; entry: string } {
  write('pnpm-workspace.yaml', 'packages: [apps/*]');
  write('eslint.config.mjs', 'export default [];');
  write('apps/web/package.json', '{}');
  write('apps/web/blueprint.config.mjs', 'export default {};');
  write('apps/web/src/views/Home.vue', 'export default {};');
  const entry = stale ? 'apps/web/src/views/Deleted.vue' : 'apps/web/src/views/Home.vue';

  write('eslint-suppressions.json', JSON.stringify({ [entry]: {} }));
  write('apps/web/eslint-suppressions.json', JSON.stringify({ 'src/views/Home.vue': {} }));
  const application = path.join(root, 'apps/web');

  return { application, entry };
}
