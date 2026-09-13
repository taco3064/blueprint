import { describe, expect, it } from 'vitest';

import { ConfigValidationError, configValidationError } from './validation';

describe('config validation facts', () => {
  it('preserves the discriminant and supplied fields without authoring prose', () => {
    const fact = { kind: 'duplicate-layer' as const, name: 'services' };
    const error = configValidationError(fact);

    expect(error).toBeInstanceOf(ConfigValidationError);
    expect(error.name).toBe('ConfigValidationError');
    expect(error.message).toBe('');
    expect(error.fact).toBe(fact);
  });
});
