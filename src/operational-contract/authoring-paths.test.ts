import { describe, expect, it } from 'vitest';

import { renderModuleFirstSchemaSketch, renderSchemaSketch } from '.';

describe('authoring schema source-root facts', () => {
  it('renders repository-root, default, and custom layer-first roots distinctly', () => {
    const repository = renderSchemaSketch('.');
    const defaults = renderSchemaSketch('src');
    const custom = renderSchemaSketch('apps/web/source');

    expect(repository).toContain('sourceRoot: \'.\'');
    expect(repository).toContain('\'~shared\': \'./shared\'');
    expect(defaults).not.toContain('sourceRoot: \'src\'');
    expect(defaults).toContain('\'~shared\': \'./src/shared\'');
    expect(custom).toContain('sourceRoot: \'apps/web/source\'');
  });

  it('omits only the default module-first source root', () => {
    const defaults = renderModuleFirstSchemaSketch('src');
    const custom = renderModuleFirstSchemaSketch('source');

    expect(defaults).not.toContain('sourceRoot: \'src\'');
    expect(defaults).not.toContain('Stryker was here');
    expect(custom).toContain('sourceRoot: \'source\'');
  });
});
