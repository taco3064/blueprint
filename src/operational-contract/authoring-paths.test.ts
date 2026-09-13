import { describe, expect, it } from 'vitest';

import { renderModuleFirstSchemaSketch, renderSchemaSketch } from '.';

describe('authoring schema source-root facts', () => {
  it('renders repository-root, default, and custom layer-first roots distinctly', () => {
    const repository = renderSchemaSketch('.');
    const defaults = renderSchemaSketch('src');
    const custom = renderSchemaSketch('apps/web/source');

    expect(repository.split('\n')).toContain('    sourceRoot: \'.\',');

    expect(repository.split('\n')).toContain(
      '    additionalAliases: { \'~shared\': \'./shared\' },',
    );

    expect(defaults.split('\n')).not.toContain('    sourceRoot: \'src\',');

    expect(defaults).not.toContain('Stryker was here');

    expect(defaults.split('\n')).toContain(
      '    additionalAliases: { \'~shared\': \'./src/shared\' },',
    );

    expect(custom.split('\n')).toContain('    sourceRoot: \'apps/web/source\',');

    expect(custom.split('\n')).toContain(
      '    additionalAliases: { \'~shared\': \'./apps/web/source/shared\' },',
    );
  });

  it('omits only the default module-first source root', () => {
    const defaults = renderModuleFirstSchemaSketch('src');
    const custom = renderModuleFirstSchemaSketch('source');

    expect(defaults).not.toContain('sourceRoot: \'src\'');
    expect(defaults).not.toContain('Stryker was here');
    expect(custom).toContain('sourceRoot: \'source\'');
  });
});
