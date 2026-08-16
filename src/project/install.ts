/**
 * The ESLint majors an adopting project may be on. Every package in
 * {@link REQUIRED_DEPS} must declare a peer range admitting all of them:
 * `npm install` resolves the whole list or none of it, so one package that
 * caps below the project's ESLint fails the entire install — and `init` is
 * left with a half-applied plan (field issue #37).
 */
export const SUPPORTED_ESLINT_MAJORS = [9, 10];

export const REQUIRED_DEPS = [
  'eslint',
  '@kekkai/blueprint',
  '@eslint-community/eslint-plugin-eslint-comments',
  // Carriers the generated config injects — the adopter's deps, not blueprint's.
  // import-x over import: the eslint peer cap (field issue #37) and the resolver
  // peer that broke installs (field issue #41).
  '@stylistic/eslint-plugin',
  'eslint-plugin-import-x',
];

/** Carriers added only when the detected stack needs their parser. */
export const STACK_DEPS = {
  vue: 'vue-eslint-parser',
  typescript: 'typescript-eslint',
} as const;

/**
 * Non-`eslint` peers a carrier is allowed to declare, by package. A peer on
 * something the ADOPTER owns is a version constraint blueprint imposes on
 * their repo from the outside — npm enforces it whenever the package is
 * present, and no nested copy can satisfy it, so the install fails as a whole
 * (field issue #41). `typescript-eslint` ↔ `typescript` is inherent and wide;
 * anything new belongs in a review, not in someone's adoption.
 */
export const ALLOWED_CARRIER_PEERS: Record<string, string[]> = {
  'typescript-eslint': ['typescript'],
  // The resolver stack, and with it the whole-graph rules a resolver-free plugin
  // cannot express. Held by the conformance stack fixtures, not by the argument:
  // if one fails to install, this entry is wrong and the carrier choice reopens.
  'eslint-plugin-import-x': ['@typescript-eslint/utils', 'eslint-import-resolver-node'],
};
