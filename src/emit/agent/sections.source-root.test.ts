import { describe, expect, it } from 'vitest';

import { renderPlacement } from './sections';
import type { ArchitectureDef } from '../../config';

function architecture(sourceRoot: string): ArchitectureDef {
  return {
    alias: '~app',
    sourceRoot,
    layers: [
      { name: 'components', does: 'UI' },
      { name: 'services', does: 'network' },
    ],
    module: { layout: 'folder', entry: 'index' },
  };
}

describe('renderPlacement · sourceRoot', () => {
  it.each([
    ['lib/app', 'lib/app/components/', 'lib/app/services/'],
    ['.', 'components/', 'services/'],
    ['src', 'src/components/', 'src/services/'],
  ])('names placement under %s', (sourceRoot, components, services) => {
    const out = renderPlacement(architecture(sourceRoot));

    expect(out).toContain(`\`${components}\``);
    expect(out).toContain(`\`${services}\``);
  });
});
