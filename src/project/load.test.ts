import { describe, expect, it } from 'vitest';

import { unwrapModule } from './load';

describe('unwrapModule', () => {
  it('unwraps a CJS-style default and passes ESM namespaces through', () => {
    expect(unwrapModule<{ a: number }>({ default: { a: 1 } })).toEqual({ a: 1 });
    expect(unwrapModule<{ b: number }>({ b: 2 })).toEqual({ b: 2 });
  });
});
