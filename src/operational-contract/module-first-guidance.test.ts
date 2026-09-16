import { describe, expect, it } from 'vitest';

import { reactPreset } from '../presets';
import { renderModuleFirstGrowthGuidance } from './module-first-guidance';

describe('renderModuleFirstGrowthGuidance', () => {
  it('stays absent from layer-first contracts', () => {
    expect(renderModuleFirstGrowthGuidance(reactPreset().architecture)).toBe('');
  });

  it('teaches an empty module-first runway without inventing domains', () => {
    const text = renderModuleFirstGrowthGuidance(
      reactPreset({ topology: 'module-first' }).architecture,
    );

    expect(text).toContain('architecture.modules: []');
    expect(text).toContain('requirement noun, screen');
    expect(text).toContain('container/use-case responsibilities');
    expect(text).toContain('Merge related seeds');
    expect(text).toContain('independent domains');
    expect(text).toContain('Domain-owned code stays with its domain');
    expect(text).toContain('never create a generic `shared` catch-all');
    expect(text).toContain('Module → Layer → Unit');
    expect(text).toContain('`containers` responsibilities live at each ordinary module root');
    expect(text).toContain('Set `dependsOn` from real cross-module imports');
    expect(text).toContain('never write LF config or invoke a topology transformation');
  });

  it('keeps the same semantic method after domains exist', () => {
    const architecture = reactPreset({ topology: 'module-first' }).architecture;

    architecture.modules = [{ name: 'commerce', does: 'owns commerce use cases' }];

    const text = renderModuleFirstGrowthGuidance(architecture);

    expect(text).toContain('Existing module declarations are authority');
    expect(text).not.toContain('no domain module exists yet');
    expect(text).toContain('Use a temporary LF semantic projection only as a reasoning tool');
  });
});
