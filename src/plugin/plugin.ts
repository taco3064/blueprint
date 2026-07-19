import type { ESLint } from 'eslint';
import { noDeepWatch } from './no-deep-watch';
import { usePrefix } from './use-prefix';

/**
 * The embedded ESLint plugin — rules the built-in `no-restricted-*` family
 * cannot express. Shipped inside the emitted flat config (`plugins` key), so
 * projects never install it separately.
 */
export const plugin: ESLint.Plugin = {
  meta: { name: '@kekkai/blueprint' },
  rules: {
    'no-deep-watch': noDeepWatch,
    'use-prefix': usePrefix,
  },
};
