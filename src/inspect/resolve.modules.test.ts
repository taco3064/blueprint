import { describe, expect, it } from 'vitest';
import type { ArchitectureDef } from '../config';
import { entryResolver, layoutResolver, modularVerdict } from './resolve';

const architecture: ArchitectureDef = {
  alias: '~app',
  folder: { layout: 'folder', entry: 'index' },
  layers: [
    { name: 'components', does: 'UI' },
    { name: 'hooks', does: 'state' },
  ],
};

const layoutOf = layoutResolver(architecture);
const entryOf = entryResolver(architecture);
const isLayer = (name: string): boolean => architecture.layers.some((l) => l.name === name);
const shape = { layoutOf, entryOf, isLayer };

describe('modularVerdict · a module root file', () => {
  it('imports anything inside its own module, unconstrained — no layer boundary to cross', () => {
    // A root file is in no layer, so relativeVerdict's folder-shape check never runs.
    expect(modularVerdict(['Combat', 'Combat.tsx'], ['Combat', 'hooks', 'useCombat.ts'], shape))
      .toBe('ok');

    expect(modularVerdict(['Combat', 'Combat.tsx'], ['Combat', 'components', 'Fighter.ts'], shape))
      .toBe('ok');

    // Even reaching past a folder-layout sibling's entry — root imports inner freely.
    expect(modularVerdict(
      ['Combat', 'Combat.tsx'],
      ['Combat', 'components', 'internal', 'deep.ts'],
      shape,
    )).toBe('ok');
  });
});

describe('modularVerdict · a module holding its files directly (layers: false)', () => {
  it('treats every file as root — no layer to cross for any relative target', () => {
    expect(modularVerdict(['Lobby', 'a.ts'], ['Lobby', 'b.ts'], shape)).toBe('ok');
    expect(modularVerdict(['Lobby', 'a.ts'], ['Lobby', 'sub', 'c.ts'], shape)).toBe('ok');
  });
});

describe('modularVerdict · an inner layer reaching back to its own module root', () => {
  it('is caught as leaves-layer — hand-traced: Combat/hooks/useCombat.ts importing '
    + '../Combat.tsx', () => {
    expect(modularVerdict(
      ['Combat', 'hooks', 'useCombat.ts'],
      ['Combat', 'Combat.tsx'],
      shape,
    )).toBe('leaves-layer');
  });
});

describe('modularVerdict · an inner layer staying inside itself, or reaching a sibling', () => {
  it('delegates to relativeVerdict once the module segment is stripped from both sides', () => {
    // Same layer, same module: ok (relativeVerdict's own "stays inside" case).
    expect(modularVerdict(
      ['Combat', 'hooks', 'useCombat.ts'],
      ['Combat', 'hooks', 'useOther.ts'],
      shape,
    )).toBe('ok');

    // Reaching a DIFFERENT declared layer inside the SAME module leaves that layer —
    // relativeVerdict's own verdict, unaware modules exist at all.
    expect(modularVerdict(
      ['Combat', 'hooks', 'useCombat.ts'],
      ['Combat', 'components', 'Fighter.ts'],
      shape,
    )).toBe('leaves-layer');
  });
});

describe('modularVerdict · another module', () => {
  it('is leaves-module whatever it points at — another module is reachable only at its '
    + 'entry, through the alias', () => {
    expect(modularVerdict(['Combat', 'hooks', 'useCombat.ts'], ['Lobby', 'Lobby.tsx'], shape))
      .toBe('leaves-module');

    expect(modularVerdict(['Combat', 'Combat.tsx'], ['Lobby'], shape)).toBe('leaves-module');
  });
});

describe('modularVerdict · unresolvable targets', () => {
  it('reports escapes-src for a target that climbed past the root', () => {
    expect(modularVerdict(['Combat', 'Combat.tsx'], null, shape)).toBe('escapes-src');
  });
});
