import { describe, expect, it } from 'vitest';

import { plugin } from './plugin';

/**
 * The plugin ships inside the emitted flat config, so its metadata gets read in
 * repos that never installed it: `eslint --print-config`, editor tooltips, and
 * the option validation that turns a typo in an adopter's config into an error
 * instead of a rule quietly running on defaults. None of that surfaces in
 * "does the rule report" tests, so it is asserted here against plugin.ts —
 * the catalog those repos actually receive.
 */

const RULE_IDS = [
  'no-deep-watch',
  'no-typedef-only-file',
  'relative-escape',
  'test-filename-matches-source',
  'use-prefix',
  'use-prefix-needs-reactivity',
] as const;

const DESCRIPTIONS: [(typeof RULE_IDS)[number], string][] = [
  ['no-deep-watch', 'deep watches'],
  ['no-typedef-only-file', '@typedef'],
  ['relative-escape', 'leave their folder'],
  ['test-filename-matches-source', 'co-located, same-named source sibling'],
  ['use-prefix', 'hook prefix'],
  ['use-prefix-needs-reactivity', 'reactive or lifecycle'],
];

/** Rules that accept no options at all. */
const NO_OPTIONS = [
  'no-deep-watch',
  'no-typedef-only-file',
  'test-filename-matches-source',
  'use-prefix-needs-reactivity',
] as const;

describe('plugin', () => {
  it('announces its own name — flat config namespaces every rule by it', () => {
    expect(plugin.meta?.name).toBe('@kekkai/blueprint');
  });

  it('registers exactly these rules, in this order', () => {
    expect(Object.keys(plugin.rules ?? {})).toEqual([...RULE_IDS]);
  });

  it.each(DESCRIPTIONS)('%s says what it is for', (id, fragment) => {
    expect(plugin.rules?.[id]?.meta?.docs?.description).toContain(fragment);
  });

  // `meta.type` is what `eslint --fix-type` and every reporter that groups by
  // kind read. Nothing asserted it, so all six could go empty — and an empty
  // type is not one of the three eslint accepts, which is the sort of thing that
  // surfaces as an adopter's tooling quietly skipping the rule.
  it.each([
    ['relative-escape', 'problem'],
    ['no-deep-watch', 'problem'],
    ['test-filename-matches-source', 'problem'],
    ['use-prefix', 'suggestion'],
    ['no-typedef-only-file', 'suggestion'],
    ['use-prefix-needs-reactivity', 'suggestion'],
  ] as const)('%s declares itself a %s', (id, type) => {
    expect(plugin.rules?.[id]?.meta?.type).toBe(type);
  });

  it.each(NO_OPTIONS)('%s takes no options, and its schema says so', (id) => {
    // The empty schema is what makes eslint reject `['error', {…}]` on this
    // rule, rather than accept a setting it will never read.
    expect(plugin.rules?.[id]?.meta?.schema).toEqual([]);
  });

  it('pins relative-escape options to the shape adopters are validated against', () => {
    expect(plugin.rules?.['relative-escape']?.meta?.schema).toEqual([
      {
        type: 'object',
        properties: {
          layouts: { type: 'object', additionalProperties: { enum: ['folder', 'flat'] } },
          entries: { type: 'object', additionalProperties: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ]);
  });

  it('pins use-prefix options to the shape adopters are validated against', () => {
    expect(plugin.rules?.['use-prefix']?.meta?.schema).toEqual([
      {
        type: 'object',
        properties: { prefix: { type: 'string' } },
        additionalProperties: false,
      },
    ]);
  });
});
