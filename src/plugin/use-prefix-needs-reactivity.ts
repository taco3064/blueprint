import path from 'node:path';
import type { Rule } from 'eslint';

/** The reactive / lifecycle vocabulary of both frameworks. */
const REACTIVE_API = new Set([
  // Vue
  'ref', 'reactive', 'computed', 'watch', 'watchEffect', 'shallowRef', 'toRef', 'toRefs',
  'onMounted', 'onUnmounted', 'onBeforeMount', 'onBeforeUnmount', 'provide', 'inject',
  // React
  'useState', 'useEffect', 'useMemo', 'useRef', 'useCallback', 'useReducer',
  'useContext', 'useLayoutEffect', 'useSyncExternalStore',
]);

const TEST_SUFFIX = /\.(test|spec)\.[jt]sx?$/;
const FILE_EXT = /\.(vue|[jt]sx?|mjs)$/;

/**
 * A `useX`-named file must actually use reactivity — otherwise it is a pure
 * function wearing a hook costume. Known caveat (why this is triage-tier):
 * a unit that only composes other custom hooks reports a false positive.
 */
export const usePrefixNeedsReactivity: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'A use-prefixed file must call a reactive or lifecycle API.',
    },
    schema: [],
    messages: {
      pure:
        '🚫 "{{base}}" carries the use prefix but calls no reactive/lifecycle API — '
        + 'it is a pure function; drop the prefix and move it where pure helpers live.',
    },
  },
  create(context) {
    const base = path
      .basename(context.filename)
      .replace(TEST_SUFFIX, '')
      .replace(FILE_EXT, '');

    if (!/^use[A-Z]/.test(base)) return {};

    let reactive = false;

    return {
      CallExpression(node) {
        const callee = node.callee;

        const name
          = callee.type === 'Identifier'
            ? callee.name
            : callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
              ? callee.property.name
              : null;

        if (name !== null && REACTIVE_API.has(name)) reactive = true;
      },
      'Program:exit'(node) {
        if (!reactive) context.report({ node, messageId: 'pure', data: { base } });
      },
    };
  },
};
