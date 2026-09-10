import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveArchitecture } from '../config';
import type { Blueprint } from '../config';
import { runDeps } from './deps';

let root: string;

const moduleFirst: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    modules: [
      { name: 'app', does: 'router composition', dependsOn: ['auth'] },
      { name: 'auth', does: 'identity application' },
    ],
    layers: [
      { name: 'components', does: 'UI', layout: 'folder' },
      { name: 'services', does: 'I/O', layout: 'folder' },
    ],
  },
};

const layerFirst: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'pages', does: 'routes', layout: 'folder' },
      { name: 'services', does: 'I/O', layout: 'folder' },
    ],
  },
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-deps-identity-'));

  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'deps-identity', dependencies: { react: '^19' } }),
  );

  fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// user config');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeSrc(rel: string, content = ''): void {
  const full = path.join(root, 'src', rel);

  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function writeModuleFirstFixture(): void {
  writeSrc('app/dashboard/page.tsx', 'import api from "~app/auth/services/api";');
  writeSrc('app/settings/account/page.tsx');
  writeSrc('auth/shell.tsx');
  writeSrc('auth/services/api/index.ts');
  writeSrc('auth/random/x.ts');
  writeSrc('rogue/x.ts');
}

async function jsonReport(config: Blueprint): Promise<{ units: string[]; skipped: string[] }> {
  let output = '';

  const { units } = await runDeps(root, {
    json: true,
    loadConfig: async () => config,
    log: (message) => (output = message),
  });

  return {
    units: units.map((entry) => entry.unit),
    skipped: (JSON.parse(output) as { skipped: string[] }).skipped,
  };
}

async function textReport(config: Blueprint): Promise<string> {
  let output = '';

  await runDeps(root, {
    loadConfig: async () => config,
    log: (message) => (output = message),
  });

  return output;
}

function expectSkippedOutside(config: Blueprint, skipped: string[]): void {
  const resolved = resolveArchitecture(config.architecture);

  expect(skipped.filter((folder) => resolved.classify(folder) !== null)).toEqual([]);
}

describe('runDeps · canonical architecture identity', () => {
  it('keeps app descendants and ordinary layers governed while reporting real gaps', async () => {
    writeModuleFirstFixture();

    const report = await jsonReport(moduleFirst);

    expect(report.units).toEqual(expect.arrayContaining(['app', 'auth', 'auth/services/api']));
    expect(report.skipped).toEqual(['auth/random', 'rogue']);
    expectSkippedOutside(moduleFirst, report.skipped);

    const target = await runDeps(root, {
      target: 'app/settings/account/page',
      loadConfig: async () => moduleFirst,
      log: () => {},
    });

    expect(target.ok).toBe(true);
    expect(target.units[0].unit).toBe('app');

    const output = await textReport(moduleFirst);

    expect(output).toContain('← app');
    expect(output).toContain('auth/random/, rogue/');
    expect(output).not.toContain('app/dashboard/');
    expect(output).not.toContain('app/settings/');
  });

  it('keeps layer-first units governed and reports only undeclared folders', async () => {
    writeSrc('pages/Home/index.tsx');
    writeSrc('services/api/index.ts');
    writeSrc('legacy/x.ts');

    const report = await jsonReport(layerFirst);

    expect(report.units).toEqual(expect.arrayContaining(['pages/Home', 'services/api']));
    expect(report.skipped).toEqual(['legacy']);
    expectSkippedOutside(layerFirst, report.skipped);

    const output = await textReport(layerFirst);

    expect(output).toContain('pages/Home');
    expect(output).toContain('invisible to deps: legacy/)');
  });
});
