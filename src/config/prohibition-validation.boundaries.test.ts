import { expect, it } from 'vitest';
import { validateBlueprint } from '../operational-contract';
import type { Blueprint, ExecutableMustNot, MustNotCheck } from './types';

function blueprint(entry: ExecutableMustNot): Blueprint {
  return { framework: 'react', architecture: { alias: '@', layers: [
    { name: 'domain', does: 'policy', mustNot: [entry] },
  ] } };
}

function prohibition(): ExecutableMustNot {
  return { id: 'ban', description: 'render UI', checks: [{ call: 'divIcon' }] };
}

it('rejects malformed executable declarations through the exported validation entry', () => {
  const valid = blueprint(prohibition());

  expect(validateBlueprint(valid)).toBe(valid);

  expect(() => validateBlueprint(blueprint({ ...prohibition(), checks: [] })))
    .toThrow('Executable checks must be a non-empty array');
});

it.each([' ', '\t', '\n'])('rejects whitespace-only executable text %j', (whitespace) => {
  expect(() => validateBlueprint(blueprint({ ...prohibition(), description: whitespace })))
    .toThrow('Executable description must be a non-empty string');

  expect(() => validateBlueprint(blueprint({ ...prohibition(), id: whitespace })))
    .toThrow('Executable id must match');
});

it.each<MustNotCheck>([
  { call: ' ' }, { global: '\t' }, { package: '\n' },
  { capability: ' ' as 'render-ui' },
])('rejects a blank check value through public validation: %j', (check) => {
  expect(() => validateBlueprint(blueprint({ ...prohibition(), checks: [check] })))
    .toThrow('Every check discriminant must be a non-empty string');
});

it.each([' ', '\t', '\n'])('rejects whitespace-only exported names %j', (name) => {
  expect(() => validateBlueprint(blueprint({
    ...prohibition(), checks: [{ package: 'leaflet', imports: ['Icon', name] }],
  }))).toThrow('Package imports must contain distinct non-empty exported names');
});

it('rejects normalized duplicates through public validation and preserves distinct checks', () => {
  const distinct = blueprint({ ...prohibition(), checks: [
    { package: 'leaflet', imports: ['Icon', 'Marker'] },
    { package: 'leaflet', imports: ['Icon'] },
  ] });

  expect(validateBlueprint(distinct)).toBe(distinct);

  expect(() => validateBlueprint(blueprint({ ...prohibition(), checks: [
    { package: 'leaflet', imports: ['Icon', 'Marker'] },
    { package: 'leaflet', pattern: false, imports: ['Marker', 'Icon'] },
  ] }))).toThrow('Duplicate normalized checks are not allowed');
});
