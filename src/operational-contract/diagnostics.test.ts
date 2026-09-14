import { describe, expect, it } from 'vitest';

import {
  renderArchitectureReport,
  renderCoverageReport,
  renderCoverageSummary,
  renderDivergentReadingClause,
  renderDoctorCheck,
  renderDoctorReport,
  renderEslintRuntimeFailure,
  renderFindingMessage,
  renderImportGraphDerivation,
  renderMetricGateNote,
  renderModuleContainerImport,
  renderModuleFlowViolation,
  renderRedundantRelativeSegments,
  renderRestrictedGlobal,
  renderRulesReport,
  renderSurveyScopeNote,
  renderUnreachedIgnoreNote,
} from './index';

describe('operational diagnostic prose', () => {
  it('describes an unreadable alias consumer without a named configuration file', () => {
    const check = renderDoctorCheck({
      kind: 'alias-consumer',
      evidence: {
        consumer: 'test-runner', status: 'unverified', aliases: ['~app'], files: [],
      },
      sourceRoot: 'src',
    });

    expect(check.skipped).toBe('the configuration could not be read statically');
  });

  it('keeps failed, skipped, and passing doctor facts distinct', () => {
    const failed = renderDoctorCheck({
      kind: 'lint-entrypoint', reachable: false, reason: 'missing-lint',
    });

    const skipped = renderDoctorCheck({ kind: 'live-lint', status: 'unreachable' });
    const passed = renderDoctorCheck({ kind: 'config', present: true });

    expect(failed).toMatchObject({ ok: false, detail: expect.stringContaining('add one') });
    expect(skipped).toMatchObject({ ok: true, skipped: expect.stringContaining('red') });
    expect(passed).toEqual({ label: 'blueprint.config.mjs present', ok: true });

    const complete = renderDoctorReport([passed], {});

    expect(complete).toContain('Adoption complete');
    expect(complete).not.toContain('Stryker was here');
    expect(renderDoctorReport([skipped], {})).toContain('Adoption unverified');
    expect(renderDoctorReport([failed], {})).toContain('Adoption incomplete');
  });

  it('renders finding actions from distinct measured facts', () => {
    expect(renderFindingMessage({
      kind: 'package-ownership',
      specifier: 'axios',
      names: ['get'],
      owners: ['services'],
      importer: 'pages',
    })).toBe('"axios" (get) is owned by services — not importable from "pages".');

    expect(renderFindingMessage({
      kind: 'missing-position', name: 'hooks', subject: 'layer',
    })).toContain('runway, not a todo');

    expect(renderFindingMessage({
      kind: 'relative-escape-entry', specifier: '../Card/impl', entry: 'index',
    })).toContain('what lives behind it is that unit\'s own business');

    expect(renderFindingMessage({
      kind: 'same-layer-alias', subject: '~app/components/Card',
    })).toBe('Same-layer import "~app/components/Card" via the alias — use a relative path or '
      + 'extract to a lower layer.');
  });
});

describe('operational coverage prose', () => {
  it('keeps vacuous coverage distinct from a reached architecture net', () => {
    const base = {
      sourceFiles: 2,
      outsideNets: [],
      activeRules: 1,
      gatedRules: 2,
    };

    expect(renderCoverageReport({ ...base, layerFiles: 0 }, 'next: add code'))
      .toContain('green gate proves nothing yet');

    expect(renderCoverageReport({ ...base, layerFiles: 2 }, 'next: unused'))
      .toContain('Coverage: 2/2');
  });

  it('keeps empty, capped, and overflowing ignored-file summaries distinct', () => {
    const base = {
      sourceFiles: 5,
      layerFiles: 0,
      outsideNets: [],
      activeRules: 0,
      gatedRules: 1,
    };

    expect(renderCoverageSummary({ ...base, ignoredFiles: [] }))
      .not.toContain('lint ignored');

    expect(renderCoverageSummary({
      ...base,
      ignoredFiles: ['a', 'b', 'c', 'd', 'e'],
    })).toContain('(lint ignored: a, b, c, d, e)');

    expect(renderCoverageSummary({
      ...base,
      ignoredFiles: ['a', 'b', 'c', 'd', 'e', 'f'],
    })).toContain('(6 lint ignored — too many to name)');
  });

  it('keeps an empty architecture report distinct from a finding report', () => {
    const fact = { importGraph: null };
    const empty = renderArchitectureReport([], fact);

    const finding = renderArchitectureReport([{
      severity: 'error',
      rule: 'same-layer-alias',
      path: 'src/a.ts',
      message: 'use a relative path',
    }], fact);

    expect(empty).toContain('✓ Architecture Success — no violations found.');
    expect(finding).toContain('[same-layer-alias] src/a.ts');
    expect(finding).not.toContain('Architecture Success');
  });

  it.each(['degraded', 'failed'] as const)(
    'withholds architecture success when import analysis is %s',
    (status) => {
      const report = renderArchitectureReport([], {
        importGraph: {
          status,
          scannedFiles: 1,
          parsedFiles: status === 'degraded' ? 1 : 0,
          unknownDynamicImports: 0,
          parseFailures: [{ path: 'src/broken.ts', message: 'broken' }],
        },
      });

      expect(report).toContain(`import analysis is ${status}`);
      expect(report).not.toContain('Architecture Success');
    },
  );

  it('renders import-graph limits from measured facts', () => {
    const fact = {
      status: 'degraded' as const,
      scannedFiles: 2,
      parsedFiles: 1,
      unknownDynamicImports: 3,
      parseFailures: [{ path: 'src/hooks/b.vue', message: 'broken' }],
    };

    const text = renderImportGraphDerivation(null);
    const observed = renderImportGraphDerivation(fact);

    expect(text).toContain('parsed AST and lexical scope');
    expect(text).toContain('Runtime-dependent expressions');
    expect(text).toContain('import * as');
    expect(text).toContain('inside a string');
    expect(text).toContain('survey');
    expect(text).toContain('ESLint applies the same bounded');
    expect(observed).toContain('3 runtime-dependent dynamic import(s)');
    expect(observed).toContain('1 file parse failure(s)');
    expect(observed).toContain('neither');
    expect(observed).toContain('verified legal dependency');
  });

  it('renders import-graph guidance at the supplied indentation', () => {
    const text = renderImportGraphDerivation(null);
    const indented = renderImportGraphDerivation(null, '  ').split('\n');

    expect(indented.every((line) => line.startsWith('  '))).toBe(true);
    expect(indented.map((line) => line.slice(2))).toEqual(text.split('\n'));
  });
});

describe('operational diagnostic boundary prose', () => {
  it('keeps ESLint package identity distinct from a missing executable', () => {
    expect(renderEslintRuntimeFailure('wrong-package'))
      .toBe('resolved package is not eslint');

    expect(renderEslintRuntimeFailure('missing-executable'))
      .toBe('eslint package has no executable');
  });

  it('keeps gate and survey scope facts explicit', () => {
    expect(renderMetricGateNote(true)).toContain('code lines only');
    expect(renderMetricGateNote(false)).toBe('plain threshold');

    expect(renderSurveyScopeNote({ kind: 'root-typescript-includes' }))
      .toContain('repository root');

    expect(renderSurveyScopeNote({ kind: 'workspace-applications' }))
      .toContain('--source-root');
  });

  it('keeps the owner decision in unreached ignore guidance', () => {
    expect(renderUnreachedIgnoreNote({
      globs: ['**/*.gen.ts'],
      reach: [{ glob: '**/*.gen.ts' }],
      probed: false,
    })).toContain('fix the glob, or leave it and the exclusion arms itself when a file matches; '
      + 'which one applies is the owner\'s call');
  });

  it('names only negated globs as divergent between scanners', () => {
    expect(renderDivergentReadingClause([{ glob: '**/*.ts' }])).toBe('');

    const divergent = renderDivergentReadingClause([
      { glob: '**/*.ts' },
      { glob: '!**/*.test.ts' },
    ]);

    expect(divergent).toContain('back: `!**/*.test.ts`');
    expect(divergent).not.toContain('back: `**/*.ts`');
  });

  it('renders each structural lint violation owned by the operational contract', () => {
    expect(renderRedundantRelativeSegments()).toContain('Redundant relative segments');
    expect(renderModuleFlowViolation()).toContain('module dependency graph');
    expect(renderModuleContainerImport()).toContain('module-root container');
    expect(renderRestrictedGlobal('window')).toContain('Use of "window" is restricted');
  });

  it('quotes every test exemption in selfOnly merge scope', () => {
    const output = renderRulesReport({
      severity: 'error',
      structural: [],
      gates: [],
      docsOnly: [],
      bans: [{
        layer: 'components',
        forbidden: [],
        packages: [],
        globals: [],
        testExemptions: ['**/*.test.ts'],
        selfOnly: [{
          target: 'services',
          selectors: [],
          jsLiteral: ['"selector"'],
          note: 'copy it',
        }],
      }],
    }, true);

    expect(output).toContain('ignores: [\'**/*.test.ts\']');
  });

  it('does not invent a test exemption when the catalog has none', () => {
    const output = renderRulesReport({
      severity: 'error',
      structural: [],
      gates: [],
      bans: [],
      docsOnly: [],
    }, false);

    expect(output).not.toContain('Stryker was here');
  });

  it('lists causes only for gates unavailable in the measured project', () => {
    const output = renderRulesReport({
      severity: 'error',
      structural: [],
      gates: [
        {
          id: 'available',
          emits: 'available/rule',
          note: 'runs here',
          declared: null,
          active: false,
        },
        {
          id: 'unavailable',
          emits: 'unavailable/rule',
          note: 'cannot run here',
          unavailable: 'requires TypeScript',
          declared: null,
          active: false,
        },
      ],
      bans: [],
      docsOnly: [],
    }, true);

    expect(output).toContain('· unavailable: requires TypeScript');
    expect(output).not.toContain('· available: undefined');
  });
});
