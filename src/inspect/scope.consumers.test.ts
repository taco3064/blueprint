import { describe, expect, it } from 'vitest';

import type { ArchitectureDef, Blueprint } from '../config';
import { analyze } from './analyze';
import { buildUnitGraph } from './resolve';
import { applicationScopeFindings } from './scope';
import type { ScanResult, ScannedFile } from './types';

const architecture: ArchitectureDef = {
  alias: '~app',
  sourceRoot: 'src',
  modules: [{ name: 'auth', does: 'authentication' }],
  layers: [{ name: 'components', does: 'UI', layout: 'folder' }],
  additionalAliases: { '@auth': 'src/auth', '@tools': '.storybook' },
};

function file(path: string, ...specifiers: string[]): ScannedFile {
  return {
    path,
    segments: path.replace(/^src\//, '').split('/'),
    imports: specifiers.map((specifier) => ({ specifier, names: [], isExport: false })),
  };
}

function measured(...outsideFiles: ScannedFile[]): ScanResult {
  return {
    topDirs: ['auth'],
    files: [file('src/auth/components/Login/index.tsx')],
    outsideScope: {
      status: 'complete', inventoryMode: 'filesystem-fallback', files: outsideFiles,
      inventoryFiles: outsideFiles.length,
      readFiles: outsideFiles.length,
      parsedFiles: outsideFiles.length,

      directoryWalks: 0, testFilesExcluded: 0, limitations: [],
      contributions: { repositoryVisible: outsideFiles.length,
        explicitConsumerRoot: 0,
        governedReference: 0 },

    },
  };
}

function findings(scan: ScanResult, patch: Partial<ArchitectureDef> = {}) {
  return applicationScopeFindings(scan, { ...architecture, ...patch });
}

function inspected(scan: ScanResult, patch: Partial<ArchitectureDef> = {}) {
  const blueprint: Blueprint = { framework: 'react', architecture: { ...architecture, ...patch } };

  return analyze(scan, blueprint, { demand: 'application-scope' });
}

describe('application scope · explicit external consumers', () => {
  it.each(['~app/auth/components/Login', '@auth/components/Login', '../src/auth/components/Login'])(
    'exempts only a declared importer using %s', (specifier) => {
      const scan = measured(file('.storybook/preview.ts', specifier));
      const undeclared = findings(scan);

      expect(undeclared.map(({ rule, severity, path, subject }) =>
        ({ rule, severity, path, subject })))
        .toEqual([{
          rule: 'uncovered-application-source', severity: 'error',
          path: 'src', subject: '.storybook',
        }]);

      expect(findings(scan, { consumerFiles: [] })).toEqual(undeclared);
      expect(findings(scan, { consumerFiles: '.storybook/other.ts' })).toEqual(undeclared);
      expect(findings(scan, { consumerFiles: '.storybook/preview.ts' })).toEqual([]);
      expect(scan.outsideScope).toMatchObject({ files: [{ path: '.storybook/preview.ts' }] });
    },
  );

  it.each(['.storybook', 'e2e', 'scripts', 'playwright', 'cypress', 'fixtures', 'tools'])(
    'does not infer roles from %s', (directory) => {
      expect(findings(measured(file(`${directory}/run.ts`, '~app/auth/components/Login')))
        .map((finding) => finding.subject)).toEqual([directory]);
    },
  );

  it.each([{ imports: [] }, { imports: ['~app/auth/components/Login'] }])(
    'retains reverse dependencies when consumer imports are %j', ({ imports }) => {
      const scan = measured(file('.storybook/preview.ts', ...imports));

      scan.files = [file('src/auth/components/Login/index.tsx', '@tools/preview')];
      const [finding] = findings(scan, { consumerFiles: '.storybook/preview.ts' });

      expect(finding).toMatchObject({
        severity: 'error', rule: 'uncovered-application-source', path: 'src', subject: '.storybook',
      });

      expect(finding.message).toContain('code under "src" imports ".storybook"');
      expect(finding.message).not.toContain('is imported by');
      expect(finding.message).toContain('A consumer declaration never legalizes');
    },
  );

  it('filters files before directory aggregation independently of file and pattern order', () => {
    const outside = [
      file('.storybook/preview.ts', '~app/auth/components/Login'),
      file('.storybook/runtime.ts', '~app/auth/components/Login'),
      file('scripts/runtime.ts', '~app/auth/components/Login'),
      file('tools/run.ts', '~app/auth/components/Login'),
    ];

    const patterns = ['.storybook/preview.ts', 'tools/*', '.storybook/preview.ts'];
    const first = findings(measured(...outside), { consumerFiles: patterns });

    expect(first.map((finding) => finding.subject)).toEqual(['.storybook scripts']);

    expect(findings(measured(...[...outside].reverse()), {
      consumerFiles: [...patterns].reverse(),
    })).toEqual(first);

    expect(findings(measured(...outside), { consumerFiles: [...patterns, '.storybook/runtime.ts'] })
      .map((finding) => finding.subject)).toEqual(['scripts']);
  });

  it('keeps outside-to-outside and disconnected consumer files silent', () => {
    const scan = measured(
      file('.storybook/preview.ts', '../tools/run'),
      file('tools/run.ts'),
    );

    expect(findings(scan, { consumerFiles: '.storybook/preview.ts' })).toEqual([]);
    expect(findings(scan)).toEqual([]);
  });
});

describe('application scope · existing roles', () => {
  it('does not exempt governed source from ordinary folder and dependency checks', () => {
    const scan = measured(file('tools/run.ts'));

    scan.topDirs.push('unknown');
    scan.files.push(file('src/unknown/index.ts', '../auth/components/Login'));
    scan.files.push(file('src/auth/components/Bad/index.tsx', '../../../../../tools/run'));
    const original = inspected(scan);

    expect(original.some((finding) => finding.rule === 'undeclared-folder')).toBe(true);
    expect(original.some((finding) => finding.rule === 'relative-escape')).toBe(true);
    expect(inspected(scan, { consumerFiles: '**/*' })).toEqual(original);
  });

  it('retains full test precedence for files matching both roles', () => {
    const scan = measured(file('e2e/login.test.ts', '~app/auth/components/Login'));

    scan.files = [file('src/auth/components/Login/index.tsx', '@e2e/login.test')];

    const patch = {
      consumerFiles: 'e2e/**', additionalAliases: { '@e2e': 'e2e' },
    };

    const scope = (testFiles?: string[]) => inspected(scan, { ...patch, testFiles })
      .filter((finding) => finding.rule === 'uncovered-application-source');

    expect(scope()).toEqual([]);
    expect(scope([]).map((finding) => finding.subject)).toEqual(['e2e']);
  });

  it('keeps layerFilesIgnore separate from the consumer and application scope roles', () => {
    const scan = measured(file('.storybook/preview.ts', '~app/auth/components/Login'));

    const scope = (consumerFiles: string[]) => inspected(scan, {
      consumerFiles, layerFilesIgnore: '**/*',
    }).filter((finding) => finding.rule === 'uncovered-application-source');

    expect(scope([]).map((finding) => finding.subject)).toEqual(['.storybook']);
    expect(scope(['.storybook/preview.ts'])).toEqual([]);
  });

  it('uses application-relative patterns with nested roots and preserves the reverse edge', () => {
    const outside = file('src/tools/run.ts', '../features/auth/components/Login');

    outside.segments = outside.path.split('/');
    const scan = measured(outside);

    scan.files = [file('src/features/auth/components/Login/index.tsx')];
    const patch = { sourceRoot: 'src/features', consumerFiles: 'src/tools/run.ts' };

    expect(findings(scan, { ...patch, consumerFiles: 'tools/run.ts' })
      .map((finding) => finding.subject)).toEqual(['src/tools']);

    expect(findings(scan, patch)).toEqual([]);
    scan.files = [file('src/features/auth/components/Login/index.tsx', '../../../../tools/run')];
    expect(findings(scan, patch).map((finding) => finding.subject)).toEqual(['src/tools']);
  });

  it('does not add an outside universe at the application root or a layer-first finding', () => {
    expect(findings({ topDirs: ['auth'], files: [file('auth/components/Login/index.tsx')] }, {
      sourceRoot: '.', consumerFiles: '**/*',
    })).toEqual([]);

    expect(findings(measured(file('.storybook/preview.ts', '~app/auth/components/Login')), {
      modules: undefined, consumerFiles: '.storybook/other.ts',
    })).toEqual([]);
  });

  it('leaves unit graph and architecture findings unchanged for allowed consumer edges', () => {
    const empty = measured();
    const scan = measured(file('.storybook/preview.ts', '~app/auth/components/Login/deep'));
    const patch = { consumerFiles: '.storybook/preview.ts' };

    expect(buildUnitGraph(scan, { ...architecture, ...patch }))
      .toEqual(buildUnitGraph(empty, architecture));

    expect(inspected(scan, patch)).toEqual(inspected(empty));
  });
});
