import { describe, expect, it } from 'vitest';

import { renderArchitectureReport } from './inspect';

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
