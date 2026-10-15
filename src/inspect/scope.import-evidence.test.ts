import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveArchitecture } from '../config';
import type { ArchitectureDef } from '../config';
import { collectOutsideScopeWith } from './outside-scope';
import { readSourceFile, scan } from './scan';
import { applicationScopeFindings, importedPaths } from './scope';

const roots: string[] = [];

const architecture: ArchitectureDef = {
  alias: '~app', sourceRoot: 'src',
  modules: [{ name: 'auth', does: 'authentication' }],
  layers: [{ name: 'components', does: 'UI' }],
};

function fixture(governed: string, outside = ''): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-import-evidence-'));

  roots.push(root);
  fs.mkdirSync(path.join(root, 'src/auth'), { recursive: true });
  fs.mkdirSync(path.join(root, 'ignored'));
  fs.writeFileSync(path.join(root, '.gitignore'), 'ignored/\n');
  fs.writeFileSync(path.join(root, 'src/auth/index.ts'), governed);
  fs.writeFileSync(path.join(root, 'ignored/run.ts'), outside);
  expect(spawnSync('git', ['init', '-q'], { cwd: root }).status).toBe(0);

  return root;
}

function collect(root: string, config = architecture) {
  const source = scan(root, config.sourceRoot);
  const readFile = vi.fn(readSourceFile);

  const outsideScope = collectOutsideScopeWith(root, resolveArchitecture(config), {
    scan: source, options: { readFile },
  });

  return { outsideScope, readFile,
    findings: applicationScopeFindings({ ...source, outsideScope }, config) };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('application scope uses parsed module references', () => {
  it('does no ignored-tree work for import text inside a template', () => {
    const root = fixture('export const sample = `import \'../../ignored/run\';`;');
    const result = collect(root);

    expect(result.outsideScope).toMatchObject({
      status: 'complete', files: [], inventoryFiles: 0, readFiles: 0, parsedFiles: 0,
      directoryWalks: 0, limitations: [],
      contributions: { repositoryVisible: 0, explicitConsumerRoot: 0, governedReference: 0 },
    });

    expect(result.readFile).not.toHaveBeenCalled();
    expect(result.findings).toEqual([]);
  });

  it('reads the ignored tree and reports the real outward import', () => {
    const root = fixture('import \'../../ignored/run\';');
    const result = collect(root);

    expect(result.outsideScope).toMatchObject({
      status: 'complete', inventoryFiles: 1, readFiles: 1, parsedFiles: 1,
      directoryWalks: 1, limitations: [],
      contributions: { repositoryVisible: 0, explicitConsumerRoot: 0, governedReference: 1 },
    });

    expect(result.readFile.mock.calls).toEqual([[root, 'ignored/run.ts']]);
    expect(result.findings.map((finding) => finding.subject)).toEqual(['ignored']);
    expect(result.findings[0].message).toContain('code under "src" imports "ignored"');
    expect(result.findings[0].message).not.toContain('is imported by');
  });

  it.each([
    ['export const sample = `import \'~app/auth\';`;', false],
    ['import \'~app/auth\';', true],
  ])('distinguishes outside import evidence in %s', (outside, real) => {
    const root = fixture('', outside);

    fs.writeFileSync(path.join(root, '.gitignore'), '');
    const result = collect(root);

    expect(result.outsideScope).toMatchObject({
      status: 'complete', inventoryFiles: 1, readFiles: 1, parsedFiles: 1,
      directoryWalks: 0, limitations: [],
      contributions: { repositoryVisible: 1, explicitConsumerRoot: 0, governedReference: 0 },
    });

    expect(result.readFile.mock.calls).toEqual([[root, 'ignored/run.ts']]);
    expect(result.findings.map((finding) => finding.subject)).toEqual(real ? ['ignored'] : []);

    if (real) {
      expect(result.findings[0].message).toContain('code under "src" is imported by "ignored"');
      expect(result.findings[0].message).not.toContain('" imports ');
    }
  });

  it('does not recover an unparsed file through the regex import list', () => {
    expect(importedPaths({
      path: 'src/auth/index.ts', segments: ['auth', 'index.ts'],
      imports: [{ specifier: '../../ignored/run', names: [], isExport: false }],
    }, [])).toEqual([]);
  });
});
