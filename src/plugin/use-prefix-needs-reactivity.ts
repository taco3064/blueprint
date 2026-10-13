import path from 'node:path';
import type { Rule } from 'eslint';
import { delegatedReactivity } from './delegated-reactivity';

const REACTIVE_API = new Set([

  'ref', 'reactive', 'computed', 'watch', 'watchEffect', 'shallowRef', 'toRef', 'toRefs',
  'onMounted', 'onUnmounted', 'onBeforeMount', 'onBeforeUnmount', 'provide', 'inject',

  'useState', 'useEffect', 'useMemo', 'useRef', 'useCallback', 'useReducer',
  'useContext', 'useLayoutEffect', 'useSyncExternalStore',
]);

const TEST_SUFFIX = /\.(test|spec)\.[jt]sx?$/;
const FILE_EXT = /\.(vue|[jt]sx?|mjs)$/;

export const usePrefixNeedsReactivity: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Check use-prefixed files for direct or traceable reactive or lifecycle calls.',
    },
    schema: [],
    messages: {
      pure:
        '"{{base}}" has no recognised reactive/lifecycle API call '
        + 'in this file or its traced delegates. '
        + 'Relative imports are traced; unresolved imports do not prove the function is pure. '
        + 'Inspect the called hooks before changing behavior; only if it is a pure helper, '
        + 'drop the prefix and move it where pure helpers live.',
    },
  },
  create(context) {
    const base = path
      .basename(context.filename)
      .replace(TEST_SUFFIX, '')
      .replace(FILE_EXT, '');

    if (!/^use[A-Z]/.test(base)) {
      return {};
    }

    let reactive = false;

    return {
      CallExpression(node) {
        const callee = node.callee;

        const name
          = callee.type === 'Identifier'
            ? callee.name
            : callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
              ? callee.property.name
              : '';

        if (REACTIVE_API.has(name)) {
          reactive = true;
        }
      },
      'Program:exit'(node) {
        if (!reactive && !delegatedReactivity(
          context.filename, context.sourceCode.text, REACTIVE_API,
        )) {
          context.report({ node, messageId: 'pure', data: { base } });
        }
      },
    };
  },
};
