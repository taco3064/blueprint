import { describe, expect, it } from 'vitest';

import { renderAuthoringFlowBanner, renderFreshScaffoldNote } from './runtime-messages';

describe('renderFreshScaffoldNote', () => {
  const layerFirst = 'Fresh scaffold (3 source files < 10) — scaffolding the framework preset '
    + 'directly; no blueprint-authoring.md is written on this path. Force the authoring playbook '
    + 'instead with: blueprint init --topology layer-first --authoring.';

  it('keeps the positional form rendering the layer-first note', () => {
    expect(renderFreshScaffoldNote(3, 10)).toBe(layerFirst);
  });

  it('renders the same layer-first note from facts', () => {
    expect(renderFreshScaffoldNote({ files: 3, threshold: 10, topology: 'layer-first' }))
      .toBe(layerFirst);
  });

  it('renders the module-first runway note from facts', () => {
    const note = renderFreshScaffoldNote({ files: 0, threshold: 10, topology: 'module-first' });

    expect(note).toContain('as a module-first runway with `modules: []`');
    expect(note).toContain('blueprint init --topology module-first --authoring.');
  });
});

describe('renderAuthoringFlowBanner', () => {
  const base = { dryRun: false, files: 2, threshold: 10 };

  it('keeps forcedBelowThreshold rendering the threshold exit', () => {
    expect(renderAuthoringFlowBanner({ ...base, forcedBelowThreshold: true }))
      .toBe(renderAuthoringFlowBanner({ ...base, forcedExit: 'threshold' }));

    expect(renderAuthoringFlowBanner({ ...base, forcedBelowThreshold: true }))
      .toContain('below the brownfield threshold (10 source files), forced by --authoring');
  });

  it('keeps an unforced forcedBelowThreshold free of any exit', () => {
    expect(renderAuthoringFlowBanner({ ...base, forcedBelowThreshold: false }))
      .toBe('blueprint init · without a config → authoring flow (2 source files surveyed)');

    expect(renderAuthoringFlowBanner({ ...base, forcedExit: null }))
      .toBe('blueprint init · without a config → authoring flow (2 source files surveyed)');
  });

  it('renders the forced module-first runway exit', () => {
    expect(renderAuthoringFlowBanner({ ...base, dryRun: true, forcedExit: 'runway' }))
      .toBe('blueprint init --dry-run · without a config → authoring flow (2 source files '
        + 'surveyed) — a proven-empty module-first application, forced by --authoring; the '
        + 'playbook\'s own verdict will be the canonical module-first runway');
  });
});
