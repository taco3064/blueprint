import { describe, expect, it } from 'vitest';

import { renderTransformationObligationError } from './transformation';

describe('transformation obligation diagnostics', () => {
  it.each([
    ['repository-root-unavailable', 'repository root is unavailable'],
    ['origin-head-changed', 'HEAD must remain at the recorded origin start'],
    ['origin-inventory-unavailable', 'Git source inventory is unavailable at start'],
    ['framework-changed', 'framework changed'],
    ['router-changed', 'framework router position changed'],
    ['unsafe-origin-scope', 'recorded application or source scope is unsafe'],
    ['application-root-changed', 'application root changed'],
    ['source-scope-changed', 'source scope changed'],
    ['duplicate-origin-unit', 'origin contains duplicate source units'],
    ['origin-source-mismatch', 'origin source does not match Git: unit'],
    ['unrecorded-origin-source', 'unrecorded origin source: unit'],
    ['origin-role-mismatch', 'origin role does not match members: unit'],
    ['duplicate-decision', 'duplicate decision for unit'],
    ['unknown-decision-source', 'unrecorded decision source unit'],
    ['missing-destination-decision', 'recorded source unit has no destination decision'],
    ['unsafe-source-member', 'unsafe source member: unit'],
    ['source-member-remains', 'source member still exists: unit'],
    ['member-mapping-incomplete', 'member mapping is incomplete for unit'],
    ['member-destination-reused', 'destination unit is reused'],
    ['member-identity-unproven', 'transfer identity is unproven for unit → start'],
    ['unsafe-destination', 'unsafe destination: unit'],
    ['destination-missing', 'destination does not exist: unit'],
    ['destination-not-file', 'destination must be a member file, not a directory: unit'],
    ['route-destination-not-app', 'route destination is not under reserved app: unit'],
    ['container-destination-not-module',
      'container destination is not in an ordinary module: unit'],
    ['target-not-module-first', 'current config is not module-first'],
    ['reserved-app-absent', 'reserved app is absent'],
    ['final-import-analysis-failed', 'final import analysis failed'],
    ['final-architecture-errors', 'final architecture has 2 error finding(s)'],
    ['recorded-role-repeated', 'recorded LF unit role is a target layer'],
  ])('explains %s without losing measured details', (code, expected) => {
    const text = renderTransformationObligationError({
      kind: 'incomplete', failures: [{ code, subject: 'unit', expected: 'start', actual: '2' }],
    });

    expect(text).toContain('LF→MF transformation incomplete:');
    expect(text).toContain(expected);
  });

  it('retains an unknown failure code and tolerates absent optional detail', () => {
    expect(renderTransformationObligationError({
      kind: 'incomplete', failures: [{ code: 'future-proof-required' }],
    })).toContain('future-proof-required');
  });
});
