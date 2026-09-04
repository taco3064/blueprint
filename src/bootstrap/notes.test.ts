import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { lintScriptAction } from './notes';
import type { Action } from './types';
import { vuePreset } from '../presets';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-notes-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/**
 * A manifest shaped the way npm leaves one: tab indent, a trailing newline, and
 * `scripts` between `name` and `dependencies`. Neither the tabs nor the final newline
 * survive `JSON.stringify(pkg, null, 2)`, which is what makes the byte-for-byte clause
 * below bite — against a 2-space, newline-less fixture a whole-file rebuild passes it
 * while reformatting every line of a real adopter's file.
 */
const manifest = (lint: string): string => [
  '{',
  '\t"name": "demo",',
  '\t"scripts": {',
  `\t\t"lint": ${JSON.stringify(lint)},`,
  '\t\t"build": "vite build"',
  '\t},',
  '\t"dependencies": {',
  '\t\t"vue": "^3"',
  '\t}',
  '}',
  '',
].join('\n');

describe('lintScriptAction · adopter data, not a replacement pattern', () => {
  // All four tokens are legal inside an npm script: npm hands the value to the shell
  // verbatim, so this is the adopter's text and no validator can reject it. `oxlint` is
  // the control — the overwhelmingly common case, and it must not move.
  it.each([
    'echo $&',
    'tsc && echo $\'',
    'a $` b',
    'a $$ b',
    'oxlint',
  ])('splices %s in verbatim, leaving every other byte of the file alone', (lint) => {
    fs.writeFileSync(path.join(root, 'package.json'), manifest(lint));

    const action = lintScriptAction(root, vuePreset(), true);

    expect(action?.kind).toBe('write');

    const { content } = action as Extract<Action, { kind: 'write' }>;

    expect(() => JSON.parse(content)).not.toThrow();
    expect(JSON.parse(content).scripts.lint).toBe(`${lint} && eslint src`);

    // The whole file, not just the lint line: `manifest` is a pure function of the
    // script, so this pins the patch as a splice — indent, key order, the sibling
    // script and the trailing newline all come back unchanged.
    expect(content).toBe(manifest(`${lint} && eslint src`));
  });
});
