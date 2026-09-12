import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { verifyConsumers } from './editorial-consumers.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('editorial managed consumers', () => {
  it('discovers an additive consumer without a path or sentence roster', () => {
    const root = fixture(
      '<!-- @include: @/publication/semantic/test-files/core.en.md -->',
      '<!-- @include: @/publication/semantic/test-files/core.zh-TW.md -->',
    );

    expect(() => verifyConsumers(root)).not.toThrow();
  });

  it('rejects a consumer missing from the required locale', () => {
    const root = fixture(
      [
        '<!-- @include: @/publication/semantic/test-files/core.en.md -->',
        '<!-- @include: @/publication/semantic/test-files/deps.en.md -->',
      ].join('\n'),
      '<!-- @include: @/publication/semantic/test-files/core.zh-TW.md -->',
    );

    expect(() => verifyConsumers(root)).toThrow('different managed consumers');
  });

  it('rejects a consumer added only to the localized page', () => {
    const root = fixture(
      '',
      '<!-- @include: @/publication/semantic/test-files/core.zh-TW.md -->',
    );

    expect(() => verifyConsumers(root)).toThrow('different managed consumers');
  });
});

function fixture(english, traditionalChinese) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-editorial-consumers-'));
  const en = path.join(root, 'guide');
  const zh = path.join(root, 'zh-TW', 'guide');

  roots.push(root);
  fs.mkdirSync(en, { recursive: true });
  fs.mkdirSync(zh, { recursive: true });
  fs.writeFileSync(path.join(en, 'pilot.md'), `${english}\n`);
  fs.writeFileSync(path.join(zh, 'pilot.md'), `${traditionalChinese}\n`);

  return root;
}
