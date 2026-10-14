import { describe, expect, it } from 'vitest';

import { renderSchemaSketch } from './authoring-catalog';
import { renderModuleFirstMethod, renderModuleFirstSchemaSketch } from './authoring-module-first';

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

describe('module-first presentation placement', () => {
  it.each([
    'classify presentation by responsibility, not reuse or consumer count',
    'A feature-private, single-consumer presenter belongs under its module’s '
    + '`components` layer, not at the module root',
    'it needs no cross-module public export',
    'Props/view-model rendering, display formatting, callbacks/events',
    'ephemeral UI state (open/closed, tabs, focus, input drafts) do not alone make it a container',
    'Application/use-case state, service IO, routing, workflow sequencing, and '
    + 'application-level branches remain orchestration responsibilities',
    'Reuse informs shared/public promotion, not role',
  ])('keeps the placement decision: %s', (decision) => {
    expect(renderModuleFirstMethod({
      hadDir: false, otherCommands: 0, commandFile: '.claude/commands/blueprint-author.md',
    }, false)).toContain(decision);
  });
});
