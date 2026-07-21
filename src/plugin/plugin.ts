import type { ESLint } from 'eslint';
import { noDeepWatch } from './no-deep-watch';
import { noTypedefOnlyFile } from './no-typedef-only-file';
import { relativeEscape } from './relative-escape';
import { testFilenameMatchesSource } from './test-filename-matches-source';
import { usePrefix } from './use-prefix';
import { usePrefixNeedsReactivity } from './use-prefix-needs-reactivity';

/**
 * The embedded ESLint plugin — rules the built-in `no-restricted-*` family
 * cannot express. Shipped inside the emitted flat config (`plugins` key), so
 * projects never install it separately. `use-prefix` and
 * `use-prefix-needs-reactivity` are complementary directions: hooks-layer
 * exports must be use-prefixed, and use-named files must be genuinely reactive.
 * @group Utilities
 */
export const plugin: ESLint.Plugin = {
  meta: { name: '@kekkai/blueprint' },
  rules: {
    'no-deep-watch': noDeepWatch,
    'no-typedef-only-file': noTypedefOnlyFile,
    'relative-escape': relativeEscape,
    'test-filename-matches-source': testFilenameMatchesSource,
    'use-prefix': usePrefix,
    'use-prefix-needs-reactivity': usePrefixNeedsReactivity,
  },
};
