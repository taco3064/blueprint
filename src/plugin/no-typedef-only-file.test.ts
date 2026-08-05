import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { plugin } from './plugin';

const linter = new Linter({ configType: 'flat' });

function messages(code: string): string[] {
  return linter
    .verify(code, {
      plugins: { blueprint: plugin },
      languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { 'blueprint/no-typedef-only-file': 'warn' },
    })
    .map((message) => message.message);
}

describe('blueprint/no-typedef-only-file', () => {
  it('flags a file with @typedef and no runtime export', () => {
    expect(messages('/** @typedef {object} Foo */\nconst x = 1;')).toHaveLength(1);
  });

  it('passes when a runtime export accompanies the typedef', () => {
    expect(messages('/** @typedef {object} Foo */\nexport const x = 1;')).toEqual([]);
    expect(messages('/** @typedef {object} Foo */\nexport default 1;')).toEqual([]);
    expect(messages('/** @typedef {object} Foo */\nexport * from "./other";')).toEqual([]);
  });

  it('passes files with no typedef at all', () => {
    expect(messages('const x = 1;')).toEqual([]);
  });
});

describe('blueprint/no-typedef-only-file · the remedy half of the message', () => {
  it('says where the typedef has to go, not just that it is stranded', () => {
    // The diagnosis ("@typedef but no runtime export") tells the author what is
    // wrong; only the second half tells them the move — and it names the test
    // for WHICH file receives it, which is the part they would otherwise guess.
    const [message] = messages('/** @typedef {object} Foo */\nconst x = 1;');

    expect(message).toContain('no runtime export');
    expect(message).toContain('move each typedef into the producer file');
    expect(message).toContain('@returns');
  });
});
