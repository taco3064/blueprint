import { describe, expect, it } from 'vitest';

import { renderModuleFirstNextNote } from './module-first-playbook';

describe('module-first Next.js playbook note', () => {
  it('omits the Next.js contract for non-Next projects', () => {
    expect(renderModuleFirstNextNote(false)).toBe('');
  });

  it('renders the Next.js contract when App Router applies', () => {
    expect(renderModuleFirstNextNote(true)).toContain('Next.js module-first project');
  });
});
