import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { occurrences, textHunks } from './hunks';

function reverse(after: string, hunks: ReturnType<typeof textHunks>): string {
  return [...hunks].reverse().reduce((text, hunk) => {
    const at = text.indexOf(hunk.after);

    return `${text.slice(0, at)}${hunk.before}${text.slice(at + hunk.after.length)}`;
  }, after);
}

describe('textHunks', () => {
  it('finds nothing to reverse in identical text', () => {
    expect(textHunks('a\nb\n', 'a\nb\n')).toEqual([]);
  });

  it('isolates an appended ignore block from the original trailing newlines', () => {
    expect(textHunks('node_modules\n\n\n', 'node_modules\n\n# Blueprint\n!docs/a.md\n'))
      .toEqual([{ before: '', after: '# Blueprint\n!docs/a.md' }]);

    expect(textHunks('dist', 'dist\n\n# Blueprint\n!CLAUDE.md\n'))
      .toEqual([{ before: '', after: '\n\n# Blueprint\n!CLAUDE.md\n' }]);
  });

  it('keeps separate insertions separate', () => {
    const before = 'import react from \'x\';\n\nexport default defineConfig({\n'
      + '  plugins: [react()],\n});\n';

    const after = 'import { URL } from \'node:url\'\n\n'
      + 'import react from \'x\';\n\nexport default defineConfig({\n'
      + '  resolve: { alias: {} },\n  plugins: [react()],\n});\n';

    expect(textHunks(before, after)).toEqual([
      { before: '', after: 'import { URL } from \'node:url\'\n\n' },
      { before: '', after: '  resolve: { alias: {} },\n' },
    ]);
  });

  it('narrows an in-line change to the characters that differ', () => {
    expect(textHunks('{"lint":"tsc"}', '{"lint":"tsc && eslint src"}'))
      .toEqual([{ before: '', after: ' && eslint src' }]);

    expect(textHunks('{"a":1}\n', '{"b":2}\n')).toEqual([{ before: 'a":1', after: 'b":2' }]);
  });

  it('records a replacement whose lines both changed', () => {
    expect(textHunks('one\ntwo\n', 'uno\ndos\n'))
      .toEqual([{ before: 'one\ntwo', after: 'uno\ndos' }]);
  });

  it('reverses to the original whenever every inserted fragment is still unique', () => {
    expect(textHunks('a\na\na\nda\na\nb\na\n', 'a\na\na\ndx\na\na\nb\na\n'))
      .toEqual([{ before: 'a', after: 'x' }, { before: '', after: 'a\n' }]);

    fc.assert(fc.property(
      fc.array(fc.constantFrom('a\n', 'b\n', 'c\n', 'd'), { maxLength: 8 }),
      fc.array(fc.constantFrom('x\n', 'y\n', 'z\n'), { maxLength: 8 }),
      fc.array(fc.nat(8), { maxLength: 8 }),
      (base, inserts, positions) => {
        const before = base.join('');
        const lines: string[] = [...base];

        inserts.forEach((line, index) => lines.splice(positions[index] ?? 0, 0, line));

        const after = lines.join('');
        const hunks = textHunks(before, after);

        fc.pre(hunks.every((hunk) => occurrences(after, hunk.after) === 1));

        expect(reverse(after, hunks)).toBe(before);
      },
    ));
  });
});

describe('occurrences', () => {
  it.each([
    ['abcabc', 'abc', 2],
    ['aaa', 'aa', 2],
    ['abc', 'x', 0],
    ['abc', '', 0],
  ] as const)('counts %s in %s', (text, fragment, count) => {
    expect(occurrences(text, fragment)).toBe(count);
  });
});
