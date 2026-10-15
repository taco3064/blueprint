import { afterEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { collectArchitectureFacts, buildUnitGraph, scan } from '../inspect';
import type { Finding } from '../inspect';
import { cli, configSource, makeRepo, rm } from './conformance';

const dirs: string[] = [];
const component = 'src/auth/components/Login/index.ts';
const plain = 'export const Login = 1;\n';
const consumer = 'import "~app/auth/components/Login";\n';

function fixture(files: Record<string, string>, consumerFiles?: string | string[]): string {
  const blueprint: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      sourceRoot: 'src',
      modules: [{ name: 'auth', does: 'Authentication.' }],
      layers: [{ name: 'components', does: 'Presentation.', layout: 'folder' }],
      consumerFiles,
    },
  };

  const root = makeRepo({ files: {
    'blueprint.config.mjs': configSource(blueprint),
    [component]: plain,
    ...files,
  } });

  dirs.push(root);

  return root;
}

async function inspect(root: string): Promise<{ code: number; findings: Finding[] }> {
  const result = await cli(root, ['inspect', '--json']);
  const output = JSON.parse(result.output) as { findings: Finding[] };

  return { code: result.code, findings: output.findings };
}

afterEach(() => {
  for (const root of dirs.splice(0)) {
    rm(root);
  }
});

describe('explicit external consumers through the CLI (#530)', () => {
  it.each(['.storybook/preview.ts', 'e2e/support.ts', 'scripts/seed.ts'])(
    'removes only the declared outside-to-source edge for %s',
    async (file) => {
      const files = { [file]: consumer };
      const before = await inspect(fixture(files));
      const empty = await inspect(fixture(files, []));
      const after = await inspect(fixture(files, file));

      expect(before.code).toBe(1);

      expect(before.findings).toEqual([expect.objectContaining({
        rule: 'uncovered-application-source', severity: 'error', path: 'src',
        subject: file.split('/')[0],
      })]);

      expect(empty).toEqual(before);
      expect(after).toEqual({ code: 0, findings: [] });
    },
  );

  it('keeps an undeclared importer in the same directory red', async () => {
    const result = await inspect(fixture({
      '.storybook/preview.ts': consumer,
      '.storybook/runtime.ts': consumer,
    }, '.storybook/preview.ts'));

    expect(result.code).toBe(1);

    expect(result.findings).toEqual([expect.objectContaining({
      rule: 'uncovered-application-source', subject: '.storybook',
    })]);
  });

  it('keeps a governed-to-consumer dependency red after the declaration', async () => {
    const result = await inspect(fixture({
      [component]: 'import "../../../../.storybook/preview";\n',
      '.storybook/preview.ts': consumer,
    }, '.storybook/preview.ts'));

    expect(result.code).toBe(1);

    expect(result.findings.filter((finding) => finding.rule === 'uncovered-application-source'))
      .toEqual([expect.objectContaining({
        severity: 'error', path: 'src', subject: '.storybook',
      })]);
  });

  it('does not let a broad declaration hide governed source violations', async () => {
    const files = { 'src/hidden/runtime.ts': plain, '.storybook/preview.ts': consumer };
    const before = await inspect(fixture(files));
    const after = await inspect(fixture(files, '**/*.ts'));

    expect(after.code).toBe(1);
    expect(after.findings.length).toBeGreaterThan(0);

    expect(after.findings).toEqual(before.findings.filter(
      (finding) => finding.rule !== 'uncovered-application-source',
    ));
  });

  it('keeps outside consumers out of the unit graph with or without declarations', () => {
    const root = fixture({ '.storybook/preview.ts': consumer });
    const scanned = scan(root, 'src');

    const architecture: Blueprint['architecture'] = {
      alias: '~app', sourceRoot: 'src',
      modules: [{ name: 'auth', does: 'Authentication.' }],
      layers: [{ name: 'components', does: 'Presentation.', layout: 'folder' }],
    };

    const outside = collectArchitectureFacts(root, { framework: 'react', architecture },
      { demand: 'application-scope' }).outsideScope;

    expect('files' in outside && outside.files.map((file) => file.path))
      .toContain('.storybook/preview.ts');

    const before = buildUnitGraph(scanned, architecture);

    expect(buildUnitGraph(scanned, { ...architecture, consumerFiles: '**/*.ts' }))
      .toEqual(before);

    expect(before).toEqual({
      units: new Set(['auth/components/Login']), edges: new Map(), counts: new Map(),
    });
  });
});
