import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { runRetire } from './retire';

const dirs: string[] = [];

function repo(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-retire-'));

  dirs.push(dir);

  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);

    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  return dir;
}

afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe('runRetire', () => {
  it('finds every hand-maintained pointer at the retired tool (batch 12)', () => {
    // The field case: structure.config.json deleted, five kinds of stale
    // pointer left behind — docs, README, code comments, an agent skill.
    const dir = repo({
      'README.md': '# app\n\nBoundaries are checked by structure-lint.\n',
      'docs/folder-architecture.md': 'Run `npx structure-lint` before committing.\n',
      'src/main.ts': '// structure-lint used to gate this import\nexport {};\n',
      '.claude/skills/arch/SKILL.md': 'Use structure-lint to verify.\n',
      'src/clean.ts': 'export const ok = true;\n',
    });

    const lines: string[] = [];
    const { ok, hits } = runRetire(dir, 'structure-lint', { log: (m) => void lines.push(m) });

    expect(ok).toBe(false);

    expect(hits.map((hit) => hit.file)).toEqual([
      '.claude/skills/arch/SKILL.md',
      'README.md',
      'docs/folder-architecture.md',
      'src/main.ts',
    ]);

    const output = lines.join('\n');

    expect(output).toContain('4 reference(s) in 4 file(s)');
    expect(output).toContain('re-run until clean');
    expect(output).toContain('3: Boundaries are checked by structure-lint.');
  });

  it('skips dependencies, build output, and lockfiles — never actionable', () => {
    const dir = repo({
      'node_modules/structure-lint/package.json': '{"name":"structure-lint"}',
      'dist/bundle.js': 'structure-lint',
      'package-lock.json': '{"packages":{"node_modules/structure-lint":{}}}',
      'image.png': 'structure-lint', // non-text extension — never read
    });

    const { ok, hits } = runRetire(dir, 'structure-lint', { log: () => {} });

    expect(ok).toBe(true);
    expect(hits).toEqual([]);
  });

  it('reports a clean sweep and trims pathological lines', () => {
    const lines: string[] = [];

    runRetire(repo({ 'README.md': '# clean\n' }), 'structure-lint', {
      log: (m) => void lines.push(m),
    });

    expect(lines.join('')).toContain('✓ No references to "structure-lint"');

    const long = repo({ 'notes.md': `${'x'.repeat(200)} structure-lint\n` });
    const report: string[] = [];

    runRetire(long, 'structure-lint', { log: (m) => void report.push(m) });

    expect(report.join('\n')).toContain('…');
  });

  it('emits JSON for tooling, and fails loud on an empty token', () => {
    const lines: string[] = [];
    const dir = repo({ 'README.md': 'uses structure-lint\n' });

    runRetire(dir, 'structure-lint', { json: true, log: (m) => void lines.push(m) });

    const parsed = JSON.parse(lines.join('')) as { ok: boolean; token: string; hits: unknown[] };

    expect(parsed).toMatchObject({ ok: false, token: 'structure-lint' });
    expect(parsed.hits).toHaveLength(1);

    expect(() => runRetire(dir, '   ')).toThrow(/needs the name to sweep for/);
  });
});
