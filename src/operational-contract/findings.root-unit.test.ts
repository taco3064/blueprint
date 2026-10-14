import { describe, expect, it } from 'vitest';
import { renderFindingMessage } from './findings';
import type { FindingMessageFact } from './findings';

const cases: { fact: FindingMessageFact; evidence: string[] }[] = [
  {
    fact: { kind: 'root-no-entry', unit: 'shop' },
    evidence: ['"shop"', 'no supported index entry', 'review its public API'],
  },
  {
    fact: { kind: 'ambiguous-root-entry', entries: ['src/shop/index.ts', 'src/shop/index.tsx'] },
    evidence: ['src/shop/index.ts, src/shop/index.tsx', 'ambiguous', 'exactly one'],
  },
  {
    fact: { kind: 'orphan-root-file', entry: 'src/shop/index.ts' },
    evidence: ['src/shop/index.ts', 'not reachable', 'remove, relocate, or connect'],
  },
  {
    fact: { kind: 'root-reachability-unknown', unit: 'shop' },
    evidence: [
      '"shop"', 'parse failure', 'runtime-dependent import', 'orphan conclusions are withheld',
    ],
  },
  {
    fact: { kind: 'missing-root-entry', subject: '~app/shop' },
    evidence: ['"~app/shop"', 'no uniquely resolvable root entry', 'exactly one'],
  },
  {
    fact: { kind: 'root-canonical-alias', subject: './shop', canonicalSpecifier: '~app/shop' },
    evidence: ['"./shop"', 'bare canonical alias "~app/shop"'],
  },
];

describe('root-unit finding guidance', () => {
  it.each(cases)('gives cause, identity, and next action for $fact.kind', ({ fact, evidence }) => {
    const message = renderFindingMessage(fact);

    for (const fragment of evidence) {
      expect(message).toContain(fragment);
    }
  });
});
