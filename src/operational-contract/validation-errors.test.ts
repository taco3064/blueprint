import { describe, expect, it } from 'vitest';

import { renderValidationError, renderValidationErrorCause } from './validation-errors';

describe('validation error boundary', () => {
  it('preserves a non-Error rejection as diagnostic detail', () => {
    expect(renderValidationErrorCause('loader rejected')).toBe('loader rejected');
  });

  it('does not render ordinary unknown keys as allowed-importer guidance', () => {
    const rendered = renderValidationError({
      kind: 'unknown-key',
      key: 'unexpected',
      where: 'the blueprint',
      allowed: ['name', 'framework'],
    });

    expect(rendered).toContain('Expected keys: name, framework.');
    expect(rendered).not.toContain('allowedImporters');
    expect(rendered).not.toContain('selfOnly lives');
  });
});
