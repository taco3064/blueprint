import { describe, expect, it } from 'vitest';

import { readScript } from './javascript';

/** The scan's two readings, or the string `null` when it gave up. */
const read = (text: string): { code: string; outsideLiterals: string } | null => readScript(text);

describe('readScript · what survives as code', () => {
  it('drops a line comment and keeps the line that follows it', () => {
    expect(read('// gone\nkept;\n')?.code).toBe('\nkept;\n');
  });

  it('drops a line comment that runs to the end of the file', () => {
    // No newline to stop at. `indexOf` answering -1 has to mean "to the end"
    // rather than an index, or the scan walks off the string and the copy that
    // follows is one character of garbage.
    expect(read('kept;\n// gone')?.code).toBe('kept;\n');
  });

  it('drops a block comment and rejoins what sits either side of it', () => {
    expect(read('a/* gone */b')?.code).toBe('ab');
  });

  it('reads `/*/` as a comment that never closed', () => {
    // The closing search starts AFTER the opener. Starting at the opener finds
    // the opener's own `*` with the next `/` and calls a comment closed that
    // swallows the whole rest of the file.
    expect(read('/*/ still inside')).toBeNull();
  });

  it('gives up on a block comment that never closes', () => {
    expect(read('code;\n/* and then nothing')).toBeNull();
  });

  it('keeps a comment opener that is inside a literal', () => {
    // A flat config's globs are full of them: `"src/**/*.ts"` carries `/*`,
    // and treating it as a comment eats the rest of the config.
    expect(read('files: ["src/**/*.ts"], rules: {}')?.code)
      .toBe('files: ["src/**/*.ts"], rules: {}');
  });

  it.each([
    ['single quotes', 'x = \'a\';'],
    ['double quotes', 'x = "a";'],
    ['backticks', 'x = `a`;'],
  ])('copies a literal in %s through verbatim', (_kind, source) => {
    expect(read(source)?.code).toBe(source);
  });

  it.each([
    ['single quotes', 'x = \'a\';', 'x = \'\';'],
    ['double quotes', 'x = "a";', 'x = "";'],
    ['backticks', 'x = `a`;', 'x = ``;'],
  ])('blanks the body of a literal in %s, keeping its delimiters', (_kind, source, blanked) => {
    expect(read(source)?.outsideLiterals).toBe(blanked);
  });

  it('blanks a template hole rather than reading it as code', () => {
    // The safe direction, stated: a call written inside `${…}` goes invisible.
    // Re-entering there needs the brace nesting a parser has and this does not,
    // and an invisible tell reads as "not wired", which is recoverable.
    expect(read('x = `${emitLint(bp)}`;')?.outsideLiterals).toBe('x = ``;');
  });

  it('lets an escaped delimiter stay inside its literal', () => {
    // `'\''` closes at the third quote, not the second. One character early and
    // every bound after it is off — the rest of the file reads as string, and a
    // tell below it disappears.
    expect(read('x = \'a\\\'b\'; y = 1;')?.code).toBe('x = \'a\\\'b\'; y = 1;');
  });

  it('gives up on a literal that never closes', () => {
    expect(read('x = \'and then nothing')).toBeNull();
  });

  it('gives up on a literal whose last character is a lone backslash', () => {
    // The escape jump is two characters wide, so a trailing `\` walks the index
    // past the end. Reporting that as an unclosed literal is what keeps the
    // overrun from being copied as content.
    expect(read('x = "a\\')).toBeNull();
  });

  it('gives up on a regex it cannot tell from a comment', () => {
    // No regex detection here, deliberately. `/a\/*b/` opens what this reads as
    // a block comment, so the scan ends with nothing rather than guessing.
    expect(read('const re = /a\\/*b/;')).toBeNull();
  });

  it('reads a quote-free regex as ordinary code, which costs nothing', () => {
    expect(read('const re = /a+b/;')?.code).toBe('const re = /a+b/;');
  });
});
