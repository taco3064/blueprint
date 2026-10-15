import { describe, expect, it } from 'vitest';

import {
  renderArchitectureReport, renderImportAnalysisUnavailable, renderImportGraphDerivation,
  renderScopeBaselineRefusal,
} from './inspect';
import { renderOutsideScopeAnalysis } from './outside-scope';

const healthy = { status: 'healthy' as const, scannedFiles: 2, parsedFiles: 2,
  unknownDynamicImports: 0, parseFailures: [] };

describe('architecture verdict with measured import analysis', () => {
  it.each(['healthy', 'degraded', 'failed'] as const)('bounds the %s verdict', (status) => {
    const report = renderArchitectureReport([], {
      importGraph: {
        status, scannedFiles: 2, parsedFiles: status === 'healthy' ? 2 : 1,
        unknownDynamicImports: 0,
        parseFailures: status === 'healthy'
          ? []
          : [{ path: 'src/view.ts', message: 'syntax error' }],
      },
    });

    expect(report.split('\n')[0]).toBe(status === 'healthy'
      ? '✓ Architecture Success — no violations found.'
      : `⚠ Architecture nets found no violations, but import analysis is ${status}.`);
  });
});

it.each([undefined, { status: 'not-applicable' as const, reason: 'layer-first' }])(
  'omits absent scope sections without adding empty report paragraphs', (outsideScope) => {
    const report = renderArchitectureReport([], { importGraph: healthy, outsideScope });

    expect(report.split('\n\n')).toEqual([
      '✓ Architecture Success — no violations found.', renderImportGraphDerivation(healthy),
    ]);
  },
);

it('includes only the scope refusal when import analysis is healthy', () => {
  const partial = { status: 'partial' as const, inventoryMode: 'git-visible',
    limitations: ['unknown target'] };

  expect(renderScopeBaselineRefusal(healthy, partial)).toBe(renderOutsideScopeAnalysis(partial));
});

it('omits the inapplicable scope section from an import-analysis refusal', () => {
  const failed = { ...healthy, status: 'failed' as const, parsedFiles: 0,
    parseFailures: [{ path: 'broken.ts', message: 'syntax' }] };

  expect(renderScopeBaselineRefusal(failed, { status: 'not-applicable', reason: 'layer-first' }))
    .toBe(renderImportAnalysisUnavailable(failed));

  expect(renderScopeBaselineRefusal(healthy, { status: 'not-applicable', reason: 'layer-first' }))
    .toBe('');
});
