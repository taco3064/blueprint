import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import type { LayerMappingCandidate } from './module-mapping';
import { destinationCollisions } from './module-mapping';

const segment = fc.stringMatching(/^[a-z][a-z0-9]{0,8}$/);

function mapping(source: string, destination: string): LayerMappingCandidate {
  return {
    source,
    destination,
    module: source.split('/')[1] ?? 'module',
    layer: 'hooks',
    layout: 'file',
    disposition: 'move',
  };
}

const collisionSets = fc.uniqueArray(segment, { minLength: 2, maxLength: 30 })
  .map((destinations) => destinations.flatMap((destination) => [
    mapping(`src/left-${destination}/hooks/value.ts`, `src/hooks/${destination}.ts`),
    mapping(`src/right-${destination}/hooks/value.ts`, `src/hooks/${destination}.ts`),
  ]));

const arbitraryMapping = fc.record({
  sourceModule: segment,
  destinationModule: segment,
  file: segment,
}).map(({ sourceModule, destinationModule, file }) => mapping(
  `src/${sourceModule}/hooks/${file}.ts`,
  `src/hooks/${destinationModule}/${file}.ts`,
));

const isolated = (suffix: string): LayerMappingCandidate => ({
  source: `outside/${suffix}/source.ts`,
  destination: `outside/${suffix}/destination.ts`,
  module: suffix,
  layer: 'hooks',
  layout: 'file',
  disposition: 'move',
});

describe('module mapping properties', () => {
  it('keeps collision evidence stable across scan order and duplicate observations', () => {
    fc.assert(fc.property(collisionSets, (mappings) => {
      const expected = destinationCollisions(mappings);

      expect(expected).toHaveLength(mappings.length / 2);
      expect(destinationCollisions([...mappings].reverse())).toEqual(expected);
      expect(destinationCollisions([...mappings, ...mappings])).toEqual(expected);
    }));
  });

  it('does not change prior collision evidence when an unrelated destination is added', () => {
    fc.assert(fc.property(collisionSets, segment, (mappings, suffix) => {
      expect(destinationCollisions([...mappings, isolated(suffix)])).toEqual(
        destinationCollisions(mappings),
      );
    }));
  });

  it('does not change evidence when unrelated existing files are added', () => {
    fc.assert(fc.property(collisionSets, segment, (mappings, suffix) => {
      expect(destinationCollisions(mappings, [`outside/${suffix}.ts`])).toEqual(
        destinationCollisions(mappings),
      );
    }));
  });

  it('never treats a moving source as an existing destination collision', () => {
    fc.assert(fc.property(arbitraryMapping, (candidate) => {
      const destinationOwner = mapping('src/owner.ts', candidate.source);

      expect(destinationCollisions([candidate, destinationOwner], [candidate.source])).toEqual([]);
    }));
  });

  it('keeps an omitted existing-path list semantically empty', () => {
    const candidate = mapping('src/module/hooks/value.ts', 'stryker was here');

    expect(destinationCollisions([candidate])).toEqual(
      destinationCollisions([candidate], []),
    );
  });

  it('treats path casing as filesystem identity without changing source evidence', () => {
    fc.assert(fc.property(segment, segment, (module, file) => {
      const lower = mapping(`src/${module}/hooks/${file}.ts`, `src/hooks/${file}.ts`);

      const upper: LayerMappingCandidate = {
        ...lower,
        source: `src/${module}-other/hooks/${file}.ts`,
        destination: lower.destination.toUpperCase(),
      };

      expect(destinationCollisions([lower, upper])).toEqual([{
        destination: lower.destination,
        sources: [lower.source, upper.source].sort(),
      }]);
    }));
  });
});
