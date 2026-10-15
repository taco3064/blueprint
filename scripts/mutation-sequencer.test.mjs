import { describe, expect, it } from 'vitest';
import MutationSequencer, { directTestOf } from './mutation-sequencer.ts';

describe('mutation direct-test ordering', () => {
  it.each([
    ['/repo/src/config/capabilities.test.ts', '/repo/src/config/capabilities.ts', true],
    ['/repo/src/config/prohibitions.boundaries.test.ts', '/repo/src/config/prohibitions.ts', true],
    ['C:\\repo\\src\\config\\capabilities.test.ts', 'C:\\repo\\src\\config\\capabilities.ts', true],
    ['/repo/src/config/prohibitions-extra.test.ts', '/repo/src/config/prohibitions.ts', false],
    ['/repo/src/config/prohibitions/nested.test.ts', '/repo/src/config/prohibitions.ts', false],
    ['/repo/src/config/prohibitions.ts', '/repo/src/config/prohibitions.ts', false],
    ['/other/src/config/prohibitions.test.ts', '/repo/src/config/prohibitions.ts', false],
  ])('matches %s against %s as %s', (test, source, expected) => {
    expect(directTestOf(test, source)).toBe(expected);
  });

  function fixture(related) {
    const project = { name: '', config: { isolate: true, sequence: { groupOrder: 0 } } };

    const files = [
      { moduleId: '/repo/src/conformance/slow.test.ts', project },
      { moduleId: '/repo/src/config/capabilities.test.ts', project },
      { moduleId: '/repo/src/config/capabilities.bounds.test.ts', project },
      { moduleId: '/repo/src/config/other.test.ts', project },
    ];

    const durations = [20000, 5, 10, 1000];

    const sequencer = new MutationSequencer({
      config: { root: '/repo', related },
      cache: {
        getFileTestResults(key) {
          return { failed: false, duration: durations[files.findIndex((file) =>
            key === `:${file.moduleId.slice('/repo/'.length)}`)] };
        },
      },
    });

    return { files, sequencer };
  }

  it('runs direct tests before slow consumers without removing or duplicating files', async () => {
    const { files, sequencer } = fixture(['/repo/src/config/capabilities.ts']);

    expect(await sequencer.sort(files)).toEqual([files[2], files[1], files[0], files[3]]);

    expect(files.map((file) => file.moduleId)).toEqual([
      '/repo/src/conformance/slow.test.ts',
      '/repo/src/config/capabilities.test.ts',
      '/repo/src/config/capabilities.bounds.test.ts',
      '/repo/src/config/other.test.ts',
    ]);
  });

  it.each([undefined, [], ['/repo/src/unrelated.ts']])(
    'preserves default ordering when there are no direct matches: %j', async (related) => {
      const { files, sequencer } = fixture(related);

      expect(await sequencer.sort(files)).toEqual([files[0], files[3], files[2], files[1]]);
    },
  );
});
