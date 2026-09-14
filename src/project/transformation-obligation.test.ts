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

it.each([
  null, [], { version: 1 },
  { ...obligation, direction: 'module-first-to-layer-first' },
  ...['head', 'applicationRoot', 'selectedScope', 'sourceRoot', 'framework'].flatMap((key) => [
    { ...obligation, origin: { ...obligation.origin, [key]: '' } },
    { ...obligation, origin: { ...obligation.origin, [key]: 1 } },
  ]),
  ...[undefined, null, [], {}, { ...obligation.origin, topology: 'module-first' },
    { ...obligation.origin, router: 'unsupported' },
    { ...obligation.origin, sources: null },
    { ...obligation.origin, sources: [obligation.origin.sources[0], {}] },
    ...[null, [], {}, { role: 'unknown', unit: 'pages/Home', members: ['src/pages/Home.ts'] },
      { role: 'route-composition', unit: 1, members: ['src/pages/Home.ts'] },
      { role: 'route-composition', unit: 'pages/Home', members: [] },
      { role: 'route-composition', unit: 'pages/Home', members: [1] },
      { role: 'route-composition', unit: 'pages/Home', members: ['valid', 1] },
    ].map((source) => ({ ...obligation.origin, sources: [source] })),
  ].map((origin) => ({ ...obligation, origin })),
  ...[undefined, null, [], {}, { topology: 'layer-first', decisions: [] },
    { topology: 'module-first', decisions: null },
    ...[null, [], { source: 1, destinations: [], members: [] },
      { source: 'pages/Home', destinations: [1], members: [] },
      { source: 'pages/Home', destinations: [], members: null },
      { source: 'pages/Home', destinations: [], members: [{}] },
      { source: 'pages/Home', destinations: [], members: [{ source: '', destination: 'x' }] },
      { source: 'pages/Home', destinations: [], members: [{ source: 'x', destination: '' }] },
    ].map((decision) => ({ topology: 'module-first', decisions: [decision] })),
  ].map((target) => ({ ...obligation, target })),
])('rejects invalid machine authority schema %#', (value) => {
  const dir = root();

  fs.writeFileSync(path.join(dir, TRANSFORMATION_OBLIGATION_FILE), JSON.stringify(value));
  expect(() => readTransformationObligation(dir)).toThrow(TRANSFORMATION_OBLIGATION_FILE);
});

it.each(['app', 'both', 'pages', null] as const)('accepts supported router %s', (router) => {
  const dir = root();

  const value: LayerToModuleObligation = {
    ...obligation,
    origin: { ...obligation.origin, router, sources: [
      { role: 'container-seed', unit: 'containers/Home', members: ['src/containers/Home.ts'] },
    ] },
    target: { topology: 'module-first', decisions: [{
      source: 'containers/Home', destinations: ['src/home/components/Home.ts'],
      members: [{ source: 'src/containers/Home.ts', destination: 'src/home/components/Home.ts' }],
    }] },
  };

  fs.writeFileSync(
    path.join(dir, TRANSFORMATION_OBLIGATION_FILE), transformationObligationSource(value),
  );

  expect(readTransformationObligation(dir)).toEqual(value);
});

it('returns absent state only when no machine obligation exists', () => {
  expect(readTransformationObligation(root())).toBeNull();
});
