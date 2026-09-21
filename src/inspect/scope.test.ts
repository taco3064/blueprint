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
  'import \'../../../../config/env\';',
  'import \'@app/router\';',
  'import \'../../../../app/router\';',
  'import \'../../../../../elsewhere/thing\';',
  'import \'react\';',
  'export const Login = 1;',
].join('\n');

const tree: Record<string, string> = {
  'features/auth/components/Login/index.tsx': `${LOGIN}\n`,
  'app/router.ts': 'export const router = 1;\n',
  'app/README.md': '# app\n',
  'config/env.ts': 'export const env = 1;\n',
  'docs/guide/example.ts': 'export const example = 1;\n',
  'reports/coverage/bundle.ts': 'export const bundle = 1;\n',
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
  const { architecture: config } = blueprint(architecture);

  return applicationScopeFindings(scan(root, config.sourceRoot ?? 'features'), config)
    .map((finding) => finding.subject);
}

afterEach(() => {
  while (dirs.length) {
    fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
  }
});

describe('inspect · module-first application scope', () => {
  it('reports the uncovered directories through the inspect finding list', () => {
    const findings = analyze(scan(fixture(), 'features'), blueprint({}))
      .filter((finding) => finding.rule === 'uncovered-application-source');

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].path).toBe('features');
    expect(findings[0].message).toContain('closed-world at the source root');
    expect(findings[0].message).toContain('"app", "config"');
    expect(findings[0].message).toContain('The scan boundary is not the topology root');
  });

  it('names each reached directory once, in order, however the imports spelled it', () => {
    expect(uncovered(fixture())).toEqual(['app config']);
  });

  it('measures the application universe with the scanner, not with the alias table', () => {
    expect(uncovered(fixture({
      'features/auth/components/Login/index.tsx': 'export const Login = 1;\n',
      'app/router.ts': 'export const router = 1;\n',
    }))).toEqual([]);
  });

  it('reports a directory no alias names, reached only by a relative import', () => {
    expect(uncovered(fixture({
      'features/auth/components/Login/index.tsx':
        'import \'../../../../config/env\';\nexport const Login = 1;\n',
      'config/env.ts': 'export const env = 1;\n',
    }), { additionalAliases: undefined })).toEqual(['config']);
  });
});

describe('inspect · module-first application scope · alias spellings', () => {
  it('follows an import written as the alias itself', () => {
    expect(uncovered(fixture({
      'features/auth/components/Login/index.tsx': 'import \'@app\';\nexport const x = 1;\n',
      'app/index.ts': 'export const app = 1;\n',
    }))).toEqual(['app']);
  });

  it('follows an alias that points at the application root', () => {
    expect(uncovered(fixture({
      'features/auth/components/Login/index.tsx': 'import \'@/app/router\';\nexport const x = 1;\n',
      'app/router.ts': 'export const router = 1;\n',
    }), { additionalAliases: { '@': '.' } })).toEqual(['app']);
  });
});

describe('inspect · module-first application scope · silence', () => {
  it('says nothing when the scan never measured the application universe', () => {
    expect(applicationScopeFindings({ topDirs: [], files: [] }, blueprint({}).architecture))
      .toEqual([]);
  });

  it('holds its peace when the source root already covers the application', () => {
    expect(uncovered(fixture({
      'auth/components/Login/index.tsx': 'import \'~app/auth/components/Panel\';\n',
      'auth/components/Panel/index.tsx': 'export const Panel = 1;\n',
    }), { sourceRoot: '.', additionalAliases: undefined })).toEqual([]);
  });

  it('leaves the layer-first source root alone', () => {
    expect(uncovered(fixture(), { modules: undefined })).toEqual([]);
  });
});

const PLAIN = 'export const Login = 1;\n';

describe('inspect · module-first application scope · the other direction', () => {
  it('reports a directory that imports the module universe with nothing imported back', () => {
    expect(uncovered(fixture({
      'features/auth/components/Login/index.tsx': PLAIN,
      'app/router.ts': 'import \'~app/auth/components/Login\';\n',
    }))).toEqual(['app']);
  });

  it('follows a relative import that climbs from outside into the module universe', () => {
    expect(uncovered(fixture({
      'features/auth/components/Login/index.tsx': PLAIN,
      'app/router.ts': 'import \'../features/auth/components/Login\';\n',
    }), { additionalAliases: undefined })).toEqual(['app']);
  });

  it('names a directory once, and both edges, when the dependency runs both ways', () => {
    const root = fixture({
      'features/auth/components/Login/index.tsx': 'import \'@app/router\';\n',
      'app/router.ts': 'import \'~app/auth/components/Login\';\n',
    });

    const [finding] = applicationScopeFindings(scan(root, 'features'), blueprint({}).architecture);

    expect(finding.subject).toBe('app');
    expect(finding.message).toContain('code under "features" imports "app"');
    expect(finding.message).toContain('"app" import code under "features"');
  });

  it('separates a nested source root from its own siblings', () => {
    const files = {
      'src/features/auth/components/Login/index.tsx': PLAIN,
      'src/lib/thing.ts': 'export const thing = 1;\n',
    };

    const nested = { sourceRoot: 'src/features', additionalAliases: undefined };

    expect(uncovered(fixture({
      ...files,
      'app/router.ts': 'import \'../src/lib/thing\';\n',
    }), nested)).toEqual([]);

    expect(uncovered(fixture({
      ...files,
      'app/router.ts': 'import \'../src/features/auth/components/Login\';\n',
    }), nested)).toEqual(['app']);

    expect(uncovered(fixture({
      ...files,
      'app/router.ts': 'import \'../src/features\';\n',
    }), nested)).toEqual(['app']);
  });

  it('stays quiet about outside source that neither imports nor is imported', () => {
    expect(uncovered(fixture({
      'features/auth/components/Login/index.tsx': PLAIN,
      'docs/guide/example.ts': 'export const example = 1;\n',
    }))).toEqual([]);
  });
});

describe('inspect · application universe scan', () => {
  it('reads the source outside the source root, and nothing it never descends into', () => {
    expect(scan(fixture(), 'features').outsideFiles?.map((file) => file.path))
      .toEqual(['app/router.ts', 'config/env.ts', 'docs/guide/example.ts']);
  });

  it('has nothing outside a source root that is the application root', () => {
    expect(scan(fixture(), '.').outsideFiles).toEqual([]);
  });
});
