export const SUPPORTED_ESLINT_MAJORS = [9, 10];

export const REQUIRED_DEPS = [
  'eslint',
  '@kekkai/blueprint',
  '@eslint-community/eslint-plugin-eslint-comments',

  '@stylistic/eslint-plugin',
  'eslint-plugin-import-x',
];

export const STACK_DEPS = {
  vue: 'vue-eslint-parser',
  typescript: 'typescript-eslint',
} as const;

export const ALLOWED_CARRIER_PEERS: Record<string, string[]> = {
  'typescript-eslint': ['typescript'],

  'eslint-plugin-import-x': ['@typescript-eslint/utils', 'eslint-import-resolver-node'],
};
