import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

import {
  readTransformationObligation,
  TRANSFORMATION_OBLIGATION_FILE,
  transformationObligationSource,
} from './transformation-obligation';
import type { LayerToModuleObligation } from './transformation-obligation';

const roots: string[] = [];

function root(): string {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-obligation-'));

  roots.push(value);

  return value;
}

const obligation: LayerToModuleObligation = {
  version: 1,
  direction: 'layer-first-to-module-first',
  origin: {
    head: 'abc',
    topology: 'layer-first',
    applicationRoot: '.',
    selectedScope: 'src',
    sourceRoot: 'src',
    framework: 'react',
    router: null,
    sources: [{ role: 'route-composition', unit: 'pages/Home', members: ['src/pages/Home.ts'] }],
  },
  target: { topology: 'module-first', decisions: [] },
};

afterEach(() => {
  while (roots.length) {
    fs.rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

it('round trips the supported machine obligation', () => {
  const dir = root();

  fs.writeFileSync(
    path.join(dir, TRANSFORMATION_OBLIGATION_FILE),
    transformationObligationSource(obligation),
  );

  expect(readTransformationObligation(dir)).toEqual(obligation);
});

it.each([
  '{',
  JSON.stringify({ ...obligation, version: 2 }),
  JSON.stringify({ ...obligation, target: { topology: 'module-first', decisions: [{}] } }),
])('rejects malformed or bypass-shaped evidence', (content) => {
  const dir = root();

  fs.writeFileSync(path.join(dir, TRANSFORMATION_OBLIGATION_FILE), content);

  expect(() => readTransformationObligation(dir)).toThrow(TRANSFORMATION_OBLIGATION_FILE);
});
