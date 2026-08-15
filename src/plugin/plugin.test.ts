import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  'no-module-reexport',
  'no-module-root-import',
  'no-typedef-only-file',
  'relative-escape',
  'test-filename-matches-source',
  'use-prefix',
  'use-prefix-needs-reactivity',
] as const;

const DESCRIPTIONS: [(typeof RULE_IDS)[number], string][] = [
  ['no-deep-watch', 'deep watches'],
  ['no-module-reexport', 're-export another module'],
  ['no-module-root-import', 'import its own module root'],
  ['no-typedef-only-file', '@typedef'],
  ['relative-escape', 'leave their module'],
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
          layouts: { type: 'object', additionalProperties: { enum: ['folder', 'file'] } },
          entries: { type: 'object', additionalProperties: { type: 'string' } },
          // How many segments sit above the layer — 0 flat, 1 under modules.
          // `additionalProperties: false` is what makes a stale emitted config
          // fail loudly instead of having the option ignored.
          depth: { type: 'integer', minimum: 0 },
          // The source root the coordinates are counted from. Under the same
          // `additionalProperties: false`, so emitting it without declaring it
          // here is not a rule running on a default — it is every adopter's
          // config failing to resolve, which no conformance fixture can see:
          // the stub there takes `additionalProperties: true`.
          sourceRoot: { type: 'string' },
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

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FILES = fs.readdirSync(HERE).filter((name) => name.endsWith('.ts'));
const SHIPPED = FILES.filter((name) => !name.endsWith('.test.ts'));

/**
 * The plugin's entire internal dependency list — one entry, running DOWNWARD.
 * Stated as the whole list rather than as a ban on the last thing that went
 * wrong: an allowlist of one reddens for a second dependency as well as for a
 * returning `inspect`, and a ban on one name only ever catches that name.
 */
const INTERNAL_DEPS = ['../boundary'];

/** Every module specifier a file imports or re-exports, comments excluded. */
function specifiersOf(file: string): string[] {
  const source = fs.readFileSync(path.join(HERE, file), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\/?\*)/.test(line))
    .join('\n');

  const matches = source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)'([^']+)'/g);

  return [...matches].map(([, specifier]) => specifier);
}

/**
 * `tsc` and a green suite prove these imports resolve; they cannot prove the
 * direction they run in, which is the only thing a relocation puts at risk.
 * The plugin ships inside an adopter's flat config and has to stand alone
 * there, so what it may reach is a contract rather than a convention — and it
 * was already broken once, quietly, by three rules reading `inspect/resolve`
 * directly (#234).
 */
describe('plugin · what it is allowed to depend on', () => {
  it('reaches exactly one module outside its own folder', () => {
    const outside = SHIPPED.flatMap(specifiersOf).filter((specifier) => specifier.startsWith('..'));

    expect([...new Set(outside)].sort()).toEqual(INTERNAL_DEPS);
  });

  it('imports that one through its entry, never a file inside it', () => {
    // `../boundary/verdict` would resolve and test green while making the
    // plugin depend on where a function sits rather than on what the module
    // publishes. The assertion above reads the whole specifier, so this is
    // what that equality is buying.
    expect(INTERNAL_DEPS.every((specifier) => specifier.split('/').length === 2)).toBe(true);
  });

  it('never reads inspect — not from a rule, and not from a test either', () => {
    const specifiers = FILES.flatMap(specifiersOf);

    // Anchored, so "no inspect" cannot pass by having read nothing: every rule
    // file imports `eslint` for its `Rule` type.
    expect(specifiers).toContain('eslint');
    expect(specifiers.filter((specifier) => specifier.includes('inspect'))).toEqual([]);
  });
});
