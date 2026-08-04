import { describe, expect, it } from 'vitest';
import type { ArchitectureDef } from '../config';
import { entryResolver, layoutResolver, relativeVerdict, resolveSegments } from './resolve';

const architecture: ArchitectureDef = {
  alias: '~app',
  module: { layout: 'folder', entry: 'index' },
  layers: [
    { name: 'resources', does: 'feature modules' },
    { name: 'services', does: 'io', module: { entry: 'service' } },
    { name: 'utils', does: 'leaf helpers', module: { layout: 'flat' } },
  ],
};

const layoutOf = layoutResolver(architecture);
const entryOf = entryResolver(architecture);

describe('entryResolver', () => {
  it('takes the shared entry, and a layer override where declared', () => {
    expect(entryOf('resources')).toBe('index');
    expect(entryOf('services')).toBe('service');
  });

  it('falls back to the shared entry for a layer it does not know', () => {
    // The rule receives its layer map as options, which can lag a config
    // edit; an unknown layer must still yield an answer rather than throw.
    expect(entryOf('not-a-layer')).toBe('index');
  });
});

describe('relativeVerdict', () => {
  const own = ['resources', 'matches', 'Row.ts'];

  it('allows anything inside the importer own module', () => {
    expect(relativeVerdict(own, ['resources', 'matches', 'parts', 'Cell.ts'], layoutOf, entryOf))
      .toBe('ok');
  });

  it('allows a sibling by its entry, folder or explicit file', () => {
    expect(relativeVerdict(own, ['resources', 'markets'], layoutOf, entryOf)).toBe('ok');
    expect(relativeVerdict(own, ['resources', 'markets', 'index.ts'], layoutOf, entryOf)).toBe('ok');
  });

  it('honours a layer own entry name', () => {
    const inServices = ['services', 'api', 'client.ts'];

    expect(relativeVerdict(inServices, ['services', 'feed', 'service.ts'], layoutOf, entryOf))
      .toBe('ok');

    expect(relativeVerdict(inServices, ['services', 'feed', 'index.ts'], layoutOf, entryOf))
      .toBe('reaches-inside');
  });

  it('refuses to reach past a sibling entry', () => {
    expect(relativeVerdict(own, ['resources', 'markets', 'parts', 'Cell.ts'], layoutOf, entryOf))
      .toBe('reaches-inside');
  });

  it('refuses to leave the layer, and reports an unresolvable target', () => {
    expect(relativeVerdict(own, ['services', 'api'], layoutOf, entryOf)).toBe('leaves-layer');
    expect(relativeVerdict(own, null, layoutOf, entryOf)).toBe('escapes-src');
  });

  it('leaves a flat layer alone — it has no module folders to be inside of', () => {
    expect(relativeVerdict(['utils', 'date.ts'], ['utils', 'money.ts'], layoutOf, entryOf))
      .toBe('ok');
  });
});

describe('resolveSegments', () => {
  const dir = ['resources', 'matches'];

  it('drops the parts that address nothing, rather than pushing them as folders', () => {
    // `./x` is the most ordinary relative spelling there is, and `a//b` is a
    // routine typo. A `.` or an empty string pushed onto the stack becomes a
    // phantom folder, and every later layer/entry comparison reads the wrong
    // segment — silently, since the path still looks plausible.
    expect(resolveSegments(dir, './Row.ts')).toEqual(['resources', 'matches', 'Row.ts']);

    expect(resolveSegments(dir, './parts/Cell.ts'))
      .toEqual(['resources', 'matches', 'parts', 'Cell.ts']);

    expect(resolveSegments(dir, 'parts//Cell.ts'))
      .toEqual(['resources', 'matches', 'parts', 'Cell.ts']);
  });

  it('walks up on .., and gives up rather than climbing past the root', () => {
    expect(resolveSegments(dir, '../markets/index.ts'))
      .toEqual(['resources', 'markets', 'index.ts']);

    expect(resolveSegments([], '../outside')).toBeNull();
  });
});
