import { describe, expect, it } from 'vitest';

import { withoutComments } from './comments';

const blanked = (text: string) => text.replace(/[^\n]/g, ' ');

describe('withoutComments · JavaScript and TypeScript configs', () => {
  it.each(['eslint.config.mjs', 'vite.config.ts', 'apps/web/.eslintrc.cjs'])(
    'blanks the comments the parser finds in %s and keeps strings',
    (file) => {
      const code = 'const docs = \'https://x\';\n';

      expect(withoutComments(file, `// a\n${code}/* b\nc */ export default [];\n`))
        .toBe(`${blanked('// a')}\n${code}${blanked('/* b\nc */')} export default [];\n`);
    },
  );

  it('falls back to a string-aware scan when the file does not parse', () => {
    const source = [
      'const a = \'it\\\'s // kept\';',
      'const b = "say \\"//\\" kept";',
      'const c = `//kept`;',
      '// dropped',
      'export default { /* dropped */',
      '/* unterminated',
    ].join('\n');

    expect(withoutComments('vite.config.ts', source)).toBe([
      'const a = \'it\\\'s // kept\';',
      'const b = "say \\"//\\" kept";',
      'const c = `//kept`;',
      blanked('// dropped'),
      `export default { ${blanked('/* dropped */')}`,
      blanked('/* unterminated'),
    ].join('\n'));
  });

  it('keeps an unterminated string rather than guessing where it ends', () => {
    expect(withoutComments('vite.config.ts', 'export default { a: \'// open'))
      .toBe('export default { a: \'// open');
  });
});

describe('withoutComments · JSON configs', () => {
  it('blanks JavaScript comments outside double-quoted strings, as ESLint reads JSON', () => {
    expect(withoutComments('.eslintrc.json', '{\n  // a\n  "b": "http://x", /* c */\n  "d": \'// e\'\n}'))
      .toBe(`{\n  ${blanked('// a')}\n  "b": "http://x", ${blanked('/* c */')}\n  "d": '${blanked('// e\'')}\n}`);
  });
});

describe('withoutComments · YAML configs', () => {
  it.each(['.eslintrc.yml', '.eslintrc.yaml'])('blanks # comments in %s', (file) => {
    expect(withoutComments(file, '# a\nextends: base # b\nurl: x#y\n'))
      .toBe(`${blanked('# a')}\nextends: base ${blanked('# b')}\nurl: x#y\n`);
  });

  it.each([
    ['a single-quoted scalar', 'k: \'a #v\''],
    ['a doubled single quote', 'k: \'it\'\'s #v\''],
    ['a double-quoted scalar', 'k: "a #v"'],
    ['an escaped double quote', 'k: "a\\" #v"'],
    ['a sequence entry', '- \'a #v\''],
    ['a flow sequence', '[\'a #v\', \'b #w\']'],
    ['a flow mapping', '{\'a #v\': x}'],
    ['an explicit key', '? \'a #v\''],
    ['a quoted scalar that spans lines', 'k: \'a\n  #v\''],
    ['a scalar that starts a line', '\'a #v\''],
  ])('keeps # inside %s', (_case, source) => {
    expect(withoutComments('.eslintrc.yml', `${source} # c\n`)).toBe(`${source} ${blanked('# c')}\n`);
  });

  it('opens a quoted scalar at the start of every line, not only the first', () => {
    expect(withoutComments('.eslintrc.yml', 'k: v\n\'a #b\': x # c\n'))
      .toBe(`k: v\n'a #b': x ${blanked('# c')}\n`);
  });

  it('opens a quoted scalar on the line after a comment', () => {
    expect(withoutComments('.eslintrc.yml', 'k: v # c\n\'a #b\': x\n'))
      .toBe(`k: v ${blanked('# c')}\n'a #b': x\n`);
  });

  it('reads a script config whose name only contains a YAML extension as a script', () => {
    expect(withoutComments('x.yaml.config.mjs', 'const a = \'#b\'; // c\n'))
      .toBe(`const a = '#b'; ${blanked('// c')}\n`);
  });

  it('starts a comment at # only when whitespace precedes it', () => {
    expect(withoutComments('.eslintrc.yml', 'a: b #c\nd: e# f\n'))
      .toBe(`a: b ${blanked('#c')}\nd: e# f\n`);
  });

  it('closes a block comment only after it opens', () => {
    expect(withoutComments('.eslintrc.json', '{ "a": 1 */* c */ }'))
      .toBe(`{ "a": 1 *${blanked('/* c */')} }`);

    expect(withoutComments('.eslintrc.json', '{ /*/ c */ "a": 1 }'))
      .toBe(`{ ${blanked('/*/ c */')} "a": 1 }`);
  });

  it('keeps a block comment open across lines and past a lone * or /', () => {
    expect(withoutComments('.eslintrc.json', '{ /* a\n"b" */ "c": 1 }'))
      .toBe(`{ ${blanked('/* a\n"b" */')} "c": 1 }`);

    expect(withoutComments('.eslintrc.json', '{ /* a* b/c */ "d": 1 }'))
      .toBe(`{ ${blanked('/* a* b/c */')} "d": 1 }`);
  });

  it('ends a line comment only at the line break', () => {
    expect(withoutComments('.eslintrc.json', '{ // a */ b\n"c": 1 }'))
      .toBe(`{ ${blanked('// a */ b')}\n"c": 1 }`);
  });

  it('reads only a .yml or .yaml extension as YAML', () => {
    expect(withoutComments('config-yml', '# a')).toBe('# a');
  });

  it('blanks a comment on a last line that has no line break', () => {
    expect(withoutComments('.eslintrc.yml', 'k: v # c')).toBe(`k: v ${blanked('# c')}`);
    expect(withoutComments('.eslintrc.json', '{} // c')).toBe(`{} ${blanked('// c')}`);
  });

  it('opens no string at an apostrophe inside a plain scalar', () => {
    expect(withoutComments('.eslintrc.yml', 'k: don\'t # c\n'))
      .toBe(`k: don't ${blanked('# c')}\n`);
  });

  it('keeps an unterminated quoted scalar rather than guessing where it ends', () => {
    expect(withoutComments('.eslintrc.yml', 'k: \'open # c')).toBe('k: \'open # c');
  });
});

describe('withoutComments · legacy .eslintrc', () => {
  it('blanks JSON comments first and then YAML comments, as ESLint reads the file', () => {
    expect(withoutComments('.eslintrc', '# a\n// b\nextends: "x//y" # c\n'))
      .toBe(`${blanked('# a')}\n${blanked('// b')}\nextends: "x//y" ${blanked('# c')}\n`);
  });

  it('keeps a lone / as text outside every quote and comment', () => {
    expect(withoutComments('.eslintrc', 'extends: \'@kekkai/blueprint\' # c\n'))
      .toBe(`extends: '@kekkai/blueprint' ${blanked('# c')}\n`);

    expect(withoutComments('.eslintrc.json', '{ "a": 1 / 2 } // c'))
      .toBe(`{ "a": 1 / 2 } ${blanked('// c')}`);
  });
});
