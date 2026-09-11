import { describe, expect, it } from 'vitest';

import type { ArchitectureDef, Blueprint } from '../../config';
import {
  renderBehavioral,
  renderChecklist,
  renderCompactContract,
  renderContext,
  renderHeader,
  renderPlacement,
} from './sections';

function architecture(): ArchitectureDef {
  return {
    alias: '~app',
    layers: [
      { name: 'components', does: 'UI', layout: 'folder', entry: 'index' },
      { name: 'services', does: 'net', layout: 'folder', entry: 'index' },
    ],
  };
}

describe('renderHeader', () => {
  it('uses a level-2 heading and no marker so it can nest in CLAUDE.md', () => {
    const out = renderHeader();

    expect(out.startsWith('## ')).toBe(true);
    expect(out).not.toContain('<!--');
  });
});

describe('renderContext', () => {
  it('states framework, alias, and the layer flow', () => {
    const blueprint: Blueprint = { framework: 'vue', architecture: architecture() };
    const out = renderContext(blueprint);

    expect(out).toContain('`vue`');
    expect(out).toContain('`~app`');
    expect(out).toContain('`components` → `services`');

    expect(out.split('\n')).toEqual([
      '### Context',
      '',
      '- Framework: `vue`. Canonical source-root alias: `~app`.',
      '- Layer flow: `components` → `services`',
    ]);
  });

  it('states module-first context and placement explicitly', () => {
    const config = architecture();

    config.modules = [
      { name: 'auth', does: 'authentication' },
      { name: 'shop', does: 'commerce', dependsOn: ['auth'] },
    ];

    const context = renderContext({ framework: 'vue', architecture: config });
    const placement = renderPlacement(config);
    const checklist = renderChecklist({ framework: 'vue', architecture: config });

    expect(context).toContain('- Modules: `auth` (depends on none); `shop` (depends on `auth`)');

    expect(placement).toContain(
      '- `src/auth/` — module: authentication. DIRECT DEPENDENCIES: none.',
    );

    expect(placement).toContain(
      '- `src/shop/` — module: commerce. DIRECT DEPENDENCIES: `auth`.',
    );

    expect(placement).toContain('- `src/auth/components/` — layer: UI.');
    expect(checklist).toContain('declared module and layer');
  });

  it('states reserved app placement without synthetic shared layers', () => {
    const config = architecture();

    config.modules = [
      { name: 'app', does: 'routing' },
      { name: 'auth', does: 'authentication' },
    ];

    const placement = renderPlacement(config);

    expect(placement).toContain('`src/app/` — reserved router-composition module');
    expect(placement).toContain('`src/auth/` — module: authentication');
    expect(placement).not.toContain('`src/app/components/`');
  });
});

describe('topology-aware agent instructions', () => {
  it('keeps layer-first placement free of module instructions', () => {
    const config: Blueprint = { framework: 'vue', architecture: architecture() };
    const compact = renderCompactContract(config);
    const behavioral = renderBehavioral(config.architecture, undefined, undefined);
    const checklist = renderChecklist(config);

    expect(compact).toContain('declared Layer → Unit topology');
    expect(compact).not.toContain('module boundaries');
    expect(behavioral).toContain('declared Layer → Unit topology');
    expect(behavioral).not.toContain('Module → Layer → Unit');
    expect(checklist).toContain('declared layer; folder units');
    expect(checklist).not.toContain('declared module and layer');
  });

  it('names module placement only for module-first topology', () => {
    const config = architecture();

    config.modules = [{ name: 'auth', does: 'identity application' }];

    const blueprint: Blueprint = { framework: 'vue', architecture: config };

    expect(renderCompactContract(blueprint)).toContain('declared Module → Layer → Unit topology');
    expect(renderCompactContract(blueprint)).toContain('module boundaries');

    expect(renderBehavioral(config, undefined, undefined))
      .toContain('declared Module → Layer → Unit topology');
  });
});
