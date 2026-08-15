import { describe, expect, it } from 'vitest';

import { describeUnreadable, parseJsonc, unreadableTsconfigs } from './jsonc';

/**
 * `parseJsonc`'s value, or null when it could not be read. The failures are
 * asserted directly further down — reason and offset both — so the cases that are
 * about the VALUE read it through one place instead of unwrapping inline.
 */
const readJsonc = (text: string): unknown => {
  const result = parseJsonc(text);

  return result.ok ? result.value : null;
};

describe('parseJsonc · where a comment starts and stops', () => {
  it('strips a line comment that has no newline after it', () => {
    // A tsconfig whose last line is a comment has no terminator, so the scan
    // has to stop at the end of the text rather than run past it.
    expect(readJsonc('{"a": 1} // tail')).toEqual({ a: 1 });
    expect(readJsonc('{"a": 1}\n// tail\n')).toEqual({ a: 1 });
  });

  it('strips a block comment wherever it sits', () => {
    expect(readJsonc('{/* lead */ "a": 1}')).toEqual({ a: 1 });
    expect(readJsonc('{"a": 1 /* trail */}')).toEqual({ a: 1 });
    expect(readJsonc('{"a": /* mid */ 1}')).toEqual({ a: 1 });
  });

  it('does not read a lone slash as the start of a comment', () => {
    // A slash appears in every path. Only a doubled one, or one followed by a
    // star, opens a comment — reading a bare slash as one swallows the rest of
    // the file and false-reds the alias check on a config that is fine.
    expect(readJsonc('{"a": "x/y"}')).toEqual({ a: 'x/y' });
    expect(readJsonc('{"a": 1, "b": 2}')).toEqual({ a: 1, b: 2 });
  });

  it('leaves an unterminated block comment unparseable instead of looping', () => {
    expect(readJsonc('{"a": 1 /* never closed')).toBeNull();
  });
});

describe('parseJsonc · the boundaries the scan must not cross', () => {
  it('parses a document with no comments or trailing commas at all', () => {
    // Both passes walk to `< length`. Walking one index further reads
    // `text[length]` — undefined — and appends the string "undefined" to the
    // output, so an ordinary tsconfig stops parsing entirely.
    expect(readJsonc('{"a":1}')).toEqual({ a: 1 });

    expect(readJsonc('{"compilerOptions":{"paths":{"~app/*":["./src/*"]}}}'))
      .toEqual({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } });
  });

  it('keeps a comma the object still needs', () => {
    // Only a comma whose next non-space is `}` or `]` is trailing. Dropping the
    // `]` half leaves `[1, 2, ]`, which JSON.parse rejects — a commented Vite
    // starter tsconfig with an array is the mainstream case (field batch 10).
    expect(readJsonc('{"a": [1, 2, ]}')).toEqual({ a: [1, 2] });
    expect(readJsonc('{"a": [1, 2], "b": 3}')).toEqual({ a: [1, 2], b: 3 });
  });

  it('protects a string in the trailing-comma pass too, not only the comment pass', () => {
    // The second pass re-scans the comment-free text, and it has to skip string
    // literals for the same reason the first one does: `,}` inside a value is
    // data. Dropping that guard silently rewrites the string.
    expect(readJsonc('{"a": ",}"}')).toEqual({ a: ',}' });
    expect(readJsonc('{"a": [",]"]}')).toEqual({ a: [',]'] });
  });

  it('does not treat a stray slash or star as opening a block comment', () => {
    // Both halves of the `/*` test matter. Matching on either character alone
    // turns a typo into a comment that swallows the rest of the file — and the
    // file then parses clean, so nothing ever reports the typo.
    expect(readJsonc('{"a": 1} /')).toBeNull();
    expect(readJsonc('{"a": 1} *')).toBeNull();
  });
});

describe('parseJsonc · why it gave up, and where', () => {
  // The failure used to be one null for three different problems, which left every
  // bound in the scanner unanswerable: reading a character too far produced the
  // same null. The offset is what turns those bounds into assertions — and it is
  // the only version an adopter can act on, since "unreadable" does not say where
  // to look.
  it('names an unterminated string and the offset the scan reached', () => {
    const text = '{ "a": "b';

    expect(parseJsonc(text)).toEqual({
      ok: false,
      reason: 'unterminated-string',
      at: text.length,
    });
  });

  it('counts an escaped character as part of the literal when reporting the offset', () => {
    // A trailing backslash consumes the character after it, so the scan ends one
    // further along than counting quotes would suggest.
    expect(parseJsonc('{ "a": "b\\')).toEqual({
      ok: false,
      reason: 'unterminated-string',
      at: 10,
    });
  });

  it('names an unclosed block comment and where it ran out', () => {
    const text = '{"a": 1 /* never closed';

    expect(parseJsonc(text)).toEqual({ ok: false, reason: 'unclosed-comment', at: text.length });
  });

  it('separates a JSON mistake from a JSONC one, and omits the offset it does not have', () => {
    // Comments and trailing commas are gone by now, so what remains is plain
    // invalid JSON — a different thing to report, and with no honest offset.
    // `at` is ABSENT rather than 0: offset 0 is a real position (a file whose
    // first character is already wrong), so a zero here would be read as one.
    expect(parseJsonc('{"a": 1} /')).toEqual({ ok: false, reason: 'not-json' });
    expect(parseJsonc('{ "compilerOptions": ')).toEqual({ ok: false, reason: 'not-json' });

    const result = parseJsonc('{"a": 1} /');

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : 'at' in result).toBe(false);
  });

  it('answers ok with the parsed value for a document it can read', () => {
    expect(parseJsonc('{"a": 1} // tail')).toEqual({ ok: true, value: { a: 1 } });
  });

  it('reads a closed block comment and keeps what follows it', () => {
    // The reason this parser exists — every Vite + TS starter ships a commented
    // tsconfig — and nothing asked it to skip a comment that CLOSES. Without a
    // fixture like this, the jump past `*/` could land anywhere.
    expect(parseJsonc('{ /* note */ "a": 1, /* and */ "b": 2 }'))
      .toEqual({ ok: true, value: { a: 1, b: 2 } });
  });

  it('does not read "/*/" as a comment that closed', () => {
    // The `*/` a naive search finds here is the opener's own `*` with the next
    // `/`. Reading it as closed would resume INSIDE the comment and parse its
    // text as data.
    expect(parseJsonc('{ "a": 1 /*/ }')).toEqual({
      ok: false,
      reason: 'unclosed-comment',
      at: 14,
    });
  });

  it('drops a line comment without eating the line under it', () => {
    expect(parseJsonc('{\n  // note\n  "a": 1\n}')).toEqual({ ok: true, value: { a: 1 } });

    // …and a file whose last line IS the comment still parses.
    expect(parseJsonc('{ "a": 1 }\n// trailing')).toEqual({ ok: true, value: { a: 1 } });
  });

  it('separates a comment opener from a bare "*" in broken text', () => {
    // `x*/` is not a comment: the `*` has no `/` before it. Treating any `*` as
    // an opener sends the scan looking for a close that was never opened, and the
    // reader is told the wrong thing about their file.
    expect(parseJsonc('{"a":1} x*/')).toEqual({ ok: false, reason: 'not-json' });
  });

  it('reads a trailing comma across whitespace, and a dangling one as invalid', () => {
    expect(parseJsonc('{ "a": 1,   \n }')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJsonc('[ 1, 2,\t]')).toEqual({ ok: true, value: [1, 2] });

    // A comma with nothing but whitespace after it is kept, so JSON.parse gets to
    // call it what it is.
    expect(parseJsonc('{"a": 1,   ')).toEqual({ ok: false, reason: 'not-json' });
  });

  it('does not read a document of "null" as an object', () => {
    // `JSON.parse('null')` is a legal parse whose value is null, so this reports
    // `ok: true` with a value no reader may reach into. The readers' half of that
    // contract — `.compilerOptions` on null throws, and one unreadable file would
    // take down the whole alias check — is asserted beside them in `detect.test.ts`.
    expect(parseJsonc('null')).toEqual({ ok: true, value: null });
  });

  it('keeps a comma that separates two members', () => {
    expect(parseJsonc('{ "a": 1, "b": 2 }')).toEqual({ ok: true, value: { a: 1, b: 2 } });
  });
});

describe('unreadableTsconfigs · the failures a paths reader would otherwise swallow', () => {
  it('names each present-but-unparseable file and skips the readable and absent ones', () => {
    expect(unreadableTsconfigs({
      'tsconfig.json': '{ "compilerOptions": { "paths": { "~app/*": ["./src/*"] } } }',
      'tsconfig.app.json': '{ "compilerOptions": { "paths: {} } }',
      'jsconfig.json': null,
    })).toEqual([
      { file: 'tsconfig.app.json', reason: 'unterminated-string', at: 37 },
    ]);
  });

  it('is empty when every config present can be read', () => {
    expect(unreadableTsconfigs({ 'tsconfig.json': '{}', 'jsconfig.json': null })).toEqual([]);
  });

  it('reports every unreadable file, not just the first', () => {
    const failures = unreadableTsconfigs({
      'tsconfig.json': '{ /* open',
      'tsconfig.app.json': '{"a": 1} /',
    });

    expect(failures.map(({ file }) => file))
      .toEqual(['tsconfig.json', 'tsconfig.app.json']);
  });
});

describe('describeUnreadable · one clause per file, and only an offset it has', () => {
  it('names the file, what is wrong, and where to look', () => {
    expect(describeUnreadable([
      { file: 'tsconfig.json', reason: 'unterminated-string', at: 42 },
    ])).toBe('tsconfig.json could not be read (a string literal never closes at character 42)');

    expect(describeUnreadable([
      { file: 'tsconfig.app.json', reason: 'unclosed-comment', at: 9 },
    ])).toBe('tsconfig.app.json could not be read (a block comment never closes at character 9)');
  });

  it('leaves the position out for a failure that has none', () => {
    const sentence = describeUnreadable([{ file: 'jsconfig.json', reason: 'not-json' }]);

    expect(sentence).toBe(
      'jsconfig.json could not be read (it is not valid JSON once the comments are stripped)',
    );

    expect(sentence).not.toContain('character');
  });

  it('joins several files into one sentence', () => {
    expect(describeUnreadable([
      { file: 'tsconfig.json', reason: 'not-json' },
      { file: 'jsconfig.json', reason: 'unclosed-comment', at: 4 },
    ])).toBe(
      'tsconfig.json could not be read (it is not valid JSON once the comments are stripped); '
      + 'jsconfig.json could not be read (a block comment never closes at character 4)',
    );
  });
});
