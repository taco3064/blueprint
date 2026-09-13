import { describe, expect, it } from 'vitest';

import { renderRestrictedPackage } from './lint';

describe('lint operational renderers', () => {
  it('distinguishes a whole-package restriction from named imports', () => {
    expect(renderRestrictedPackage({ package: 'axios' })).toBe(
      '\n🚫 Do not import "axios" in this layer.',
    );

    expect(renderRestrictedPackage({ package: 'vue', imports: ['inject', 'provide'] })).toBe(
      '\n🚫 Do not import inject, provide from "vue" in this layer.',
    );
  });
});
