import { describe, expect, it } from 'vitest';

import {
  renderModuleFirstNextNote,
  renderModuleFirstSemantics,
} from './module-first-playbook';

describe('module-first Next.js playbook note', () => {
  it('omits the Next.js contract for non-Next projects', () => {
    expect(renderModuleFirstNextNote(false)).toBe('');
  });

  it('renders the Next.js contract when App Router applies', () => {
    expect(renderModuleFirstNextNote(true)).toContain('Next.js module-first project');
  });

  it('renders every module-first dependency boundary', () => {
    const semantics = renderModuleFirstSemantics();

    expect(semantics).toContain('`dependsOn` declares direct module edges');
    expect(semantics).toContain('Their order defines the one-way inner-layer flow');
    expect(semantics).toContain('reserved router-composition container position');
    expect(semantics).toContain('must use the canonical source-root alias');
  });
});
