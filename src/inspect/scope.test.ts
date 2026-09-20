import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { ArchitectureDef, Blueprint } from '../config';
import { analyze } from './analyze';
import { scan } from './scan';
import { applicationScopeFindings } from './scope';

const dirs: string[] = [];

const LOGIN = [
  'import \'@app/router\';',
  'import \'../../../../config/env\';',
  'import \'../../../../../elsewhere/thing\';',
  'import \'react\';',
  'export const Login = 1;',
].join('\n');

const tree: Record<string, string> = {
  'features/auth/components/Login/index.tsx': `${LOGIN}\n`,
  'app/router.ts': 'export const router = 1;\n',
  'config/env.ts': 'export const env = 1;\n',
  'docs/guide/example.ts': 'export const example = 1;\n',
  'build/dist/bundle.ts': 'export const bundle = 1;\n',
  'node_modules/pkg/index.js': 'module.exports = 1;\n',
  'assets/logo.txt': 'logo\n',
  'vite.config.ts': 'export default {};\n',
};

function fixture(files: Record<string, string> = tree): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-scope-'));

  dirs.push(root);

  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, file);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }

  return root;
}

function blueprint(architecture: Partial<ArchitectureDef>): Blueprint {
  return {
    framework: 'react',
    architecture: {
      alias: '~app',
      sourceRoot: 'features',
      modules: [{ name: 'auth', does: 'authentication' }],
      layers: [{ name: 'components', does: 'UI', layout: 'folder' }],
      additionalAliases: { '@app': 'app' },
      ...architecture,
    },
  };
}

function uncovered(root: string, architecture: Partial<ArchitectureDef> = {}): string[] {
  const config = blueprint(architecture);
  const sourceRoot = config.architecture.sourceRoot ?? 'features';

  return analyze(scan(root, sourceRoot), config)
    .filter((finding) => finding.rule === 'uncovered-application-source')
    .map((finding) => finding.subject);
}

afterEach(() => {
  while (dirs.length) {
    fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
  }
});

describe('inspect · module-first application scope', () => {
  it('lists only the outside directories the governed source actually imports', () => {
    const root = fixture();

    const findings = analyze(scan(root, 'features'), blueprint({}))
      .filter((finding) => finding.rule === 'uncovered-application-source');

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].path).toBe('features');
    expect(findings[0].subject).toBe('app config');
    expect(findings[0].message).toContain('closed-world at the source root');
    expect(findings[0].message).toContain('"app", "config"');
    expect(findings[0].message).toContain('The scan boundary is not the topology root');
  });

  it('measures the application universe with the scanner, not with the alias table', () => {
    const root = fixture({
      'features/auth/components/Login/index.tsx': 'export const Login = 1;\n',
      'app/router.ts': 'export const router = 1;\n',
    });

    expect(uncovered(root)).toEqual([]);
  });

  it('reports a directory no alias names, reached only by a relative import', () => {
    const root = fixture({
      'features/auth/components/Login/index.tsx':
        'import \'../../../../config/env\';\nexport const Login = 1;\n',
      'config/env.ts': 'export const env = 1;\n',
    });

    expect(uncovered(root, { additionalAliases: undefined })).toEqual(['config']);
  });

  it('holds its peace when the source root already covers the application', () => {
    const root = fixture({
      'auth/components/Login/index.tsx': 'import \'~app/auth/components/Panel\';\n',
      'auth/components/Panel/index.tsx': 'export const Panel = 1;\n',
    });

    expect(uncovered(root, { sourceRoot: '.', additionalAliases: undefined })).toEqual([]);
  });

  it('says nothing when the scan never measured the application universe', () => {
    expect(applicationScopeFindings({ topDirs: [], files: [] }, blueprint({}).architecture))
      .toEqual([]);
  });

  it('leaves the layer-first source root alone', () => {
    const root = fixture();

    expect(uncovered(root, { modules: undefined })).toEqual([]);
  });
});

describe('inspect · application universe scan', () => {
  it('counts a directory as source only when it holds readable source below it', () => {
    expect(scan(fixture(), 'features').outsideDirs).toEqual(['app', 'config', 'docs']);
  });

  it('has nothing outside a source root that is the application root', () => {
    expect(scan(fixture(), '.').outsideDirs).toEqual([]);
  });
});
