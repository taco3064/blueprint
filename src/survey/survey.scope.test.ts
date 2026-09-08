import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runSurvey } from './survey';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-survey-scope-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content = ''): void {
  const full = path.join(root, rel);

  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe('runSurvey · conventional source scope', () => {
  it('keeps src when root tooling is also included', () => {
    write('package.json', JSON.stringify({ dependencies: { vue: '^3' } }));

    write('tsconfig.json', JSON.stringify({
      include: ['mock/*.ts', 'build/*.ts', 'src/**/*.ts', 'types/*.d.ts', 'vite.config.ts'],
      compilerOptions: { paths: { '@/*': ['./src/*'], '@build/*': ['./build/*'] } },
    }));

    write('src/views/Home.vue', 'export default {};');
    write('mock/server.ts', 'export {};');
    write('types/global.d.ts', 'export {};');
    write('vite.config.ts', 'export default {};');

    const result = runSurvey(root, { log: () => {} });

    expect(result.sourceRoot).toBe('src');
    expect(result.totalFiles).toBe(1);
    expect(result.folders.map((folder) => folder.folder)).toEqual(['views']);
  });

  it('requires a scope for a workspace with several application roots and no root tsconfig', () => {
    write('package.json', JSON.stringify({ dependencies: { vue: '^3' } }));
    write('apps/a/package.json', '{}');
    write('apps/a/src/main.ts', 'export {};');
    write('apps/b/package.json', '{}');
    write('apps/b/src/main.ts', 'export {};');

    const result = runSurvey(root, { log: () => {} });

    expect(result.scopeRequired).toBe(true);
    expect(result.totalFiles).toBe(0);
    expect(result.scopeNote).toContain('--source-root');
  });
});
