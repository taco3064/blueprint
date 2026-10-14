import type { Framework, MustNotCapability } from './types';

export interface MustNotCapabilityDetector {
  framework?: Exclude<Framework, 'auto'>;
  packageCalls?: Record<string, string[]>;
  packages?: string[];
  globals?: string[];
  globalMembers?: Record<string, string[]>;
  reactClass?: string[];
  jsx?: boolean;
  vueTemplate?: boolean;
  limitations: string[];
}

const BOUNDARY = 'No delegated wrappers, dependency injection, application abstractions, '
  + 'runtime execution, or cross-file value flow are inferred.';

const BINDINGS = 'Framework calls require proven imported bindings, including aliases '
  + 'and namespace members; unrelated names do not match.';

export const MUST_NOT_CAPABILITIES: Record<MustNotCapability, MustNotCapabilityDetector> = {
  'render-ui': {
    jsx: true,
    vueTemplate: true,
    packageCalls: { react: ['createElement'], vue: ['h', 'createVNode'] },
    reactClass: ['render'],
    limitations: [BINDINGS,
      'JSX, renderable Vue template nodes, and render methods on proven React '
      + 'Component/PureComponent subclasses only.', BOUNDARY],
  },
  'react-state': {
    framework: 'react',
    packageCalls: { react: ['useState', 'useReducer', 'useSyncExternalStore'] },
    reactClass: ['state', 'setState'],
    limitations: [BINDINGS, 'Class state ownership and setState use require a proven React '
    + 'Component/PureComponent subclass.', BOUNDARY],
  },
  'react-lifecycle': {
    framework: 'react',
    packageCalls: { react: ['useEffect', 'useLayoutEffect', 'useInsertionEffect'] },
    reactClass: ['componentDidMount',
      'componentDidUpdate',
      'componentWillUnmount',
      'shouldComponentUpdate',
      'getSnapshotBeforeUpdate',
      'getDerivedStateFromProps',
      'getDerivedStateFromError',
      'componentDidCatch',
      'componentWillMount',
      'componentWillReceiveProps',
      'componentWillUpdate',
      'UNSAFE_componentWillMount',
      'UNSAFE_componentWillReceiveProps',
      'UNSAFE_componentWillUpdate'],
    limitations: [BINDINGS, 'Lifecycle method declarations require a proven React '
    + 'Component/PureComponent subclass.', BOUNDARY],
  },
  'vue-reactivity': {
    framework: 'vue',
    packageCalls: { vue: ['ref',
      'shallowRef',
      'reactive',
      'shallowReactive',
      'customRef',
      'computed',
      'toRef',
      'toRefs'] },
    limitations: [BINDINGS, BOUNDARY],
  },
  'vue-lifecycle': {
    framework: 'vue',
    packageCalls: { vue: ['onBeforeMount',
      'onMounted',
      'onBeforeUpdate',
      'onUpdated',
      'onBeforeUnmount',
      'onUnmounted',
      'onActivated',
      'onDeactivated',
      'onErrorCaptured',
      'onRenderTracked',
      'onRenderTriggered',
      'onServerPrefetch'] },
    limitations: [BINDINGS, BOUNDARY],
  },
  routing: {
    packages: ['react-router',
      'react-router-dom',
      'vue-router',
      'next/router',
      'next/navigation',
      'next/link'],
    limitations: ['Proven package-family references including subpaths and type-only '
      + 'references; runtime-dependent sources remain unverified.', BOUNDARY],
  },
  'network-io': {
    globals: ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'],
    globalMembers: { navigator: ['sendBeacon'] },
    limitations: ['Unshadowed direct globals and navigator.sendBeacon only; local '
      + 'bindings do not match.', BOUNDARY],
  },
  'browser-dom': {
    globals: ['window',
      'document',
      'navigator',
      'HTMLElement',
      'Element',
      'Node',
      'EventTarget',
      'CustomEvent',
      'MutationObserver',
      'ResizeObserver',
      'IntersectionObserver',
      'localStorage',
      'sessionStorage',
      'location',
      'history',
      'customElements',
      'getComputedStyle'],
    limitations: ['Unshadowed direct global references only; declarations, keys, labels, '
      + 'and local bindings do not match.', BOUNDARY],
  },
};
