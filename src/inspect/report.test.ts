import { describe, expect, it } from 'vitest';

import { hasErrors, report } from './report';
import type { Finding } from './types';

const findings: Finding[] = [
  { severity: 'error', rule: 'undeclared-folder', path: 'src/utils', message: 'nope' },
  { severity: 'warn', rule: 'no-entry', path: 'src/components/Btn', message: 'no entry' },
];

describe('hasErrors', () => {
  it('is true only when an error-level finding exists', () => {
    expect(hasErrors(findings)).toBe(true);
    expect(hasErrors([findings[1]])).toBe(false);
    expect(hasErrors([])).toBe(false);
  });
});

describe('report', () => {
  it('celebrates a clean project', () => {
    expect(report([])).toContain('Architecture Success');
  });

  it('lists findings, a summary line, and migration steps', () => {
    const out = report(findings);

    expect(out).toContain('[undeclared-folder] src/utils');
    expect(out).toContain('[no-entry] src/components/Btn');
    expect(out).toContain('1 error(s), 1 warning(s), 0 note(s)');
    expect(out).toContain('Recommended migration steps:');
    expect(out).toContain('declare them as layers');
  });

  it('omits the migration section when no rule has a step', () => {
    const out = report([{ severity: 'info', rule: 'mystery', path: 'x', message: 'm' }]);

    expect(out).not.toContain('Recommended migration steps');
  });
});
