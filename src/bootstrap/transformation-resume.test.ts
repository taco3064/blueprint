import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { detect, TRANSFORMATION_OBLIGATION_FILE } from '../project';
import { transformationRetirement } from './transformation-resume';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-retirement-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function record(): string {
  const content = JSON.stringify({
    version: 1,
    direction: 'layer-first-to-module-first',
    origin: {
      head: 'origin', topology: 'layer-first', applicationRoot: '.', selectedScope: 'src',
      sourceRoot: 'src', framework: 'react', router: null,
      sources: [{
        role: 'route-composition', unit: 'pages/Home', members: ['src/pages/Home.ts'],
      }],
    },
    target: { topology: 'module-first', decisions: [] },
  });

  fs.writeFileSync(path.join(root, TRANSFORMATION_OBLIGATION_FILE), content);

  return content;
}

describe('transformation retirement prerequisites', () => {
  it('leaves ordinary adoption without an obligation unchanged', () => {
    expect(transformationRetirement({ root, state: detect(root), blueprint: null })).toBeNull();
  });

  it.each([
    [true, 'Explicit re-authoring does not complete'],
    [false, 'has no current config to verify'],
  ])('refuses without deleting recorded authority (authoring=%s)', (authoring, message) => {
    const content = record();

    expect(() => transformationRetirement({
      root, state: detect(root), blueprint: null, authoring,
    })).toThrow(message);

    expect(fs.readFileSync(path.join(root, TRANSFORMATION_OBLIGATION_FILE), 'utf8'))
      .toBe(content);
  });
});
