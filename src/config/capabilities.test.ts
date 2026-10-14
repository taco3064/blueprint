import { expect, it } from 'vitest';
import { MUST_NOT_CAPABILITIES } from './capabilities';
import { resolveProhibitions } from './prohibitions';
import type { MustNotCapability } from './types';

const expected = {
  'render-ui': { jsx: true,
    vueTemplate: true,
    packageCalls: { react: ['createElement'],
      vue: ['h',
        'createVNode'] },
    reactClass: ['render'] },
  'react-state': { framework: 'react',
    packageCalls: { react: ['useState',
      'useReducer',
      'useSyncExternalStore'] },
    reactClass: ['state',
      'setState'] },
  'react-lifecycle': {
    framework: 'react',
    packageCalls: { react: ['useEffect',
      'useLayoutEffect',
      'useInsertionEffect'] },
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
  },
  'vue-reactivity': { framework: 'vue',
    packageCalls: { vue: ['ref',
      'shallowRef',
      'reactive',
      'shallowReactive',
      'customRef',
      'computed',
      'toRef',
      'toRefs'] } },
  'vue-lifecycle': { framework: 'vue',
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
      'onServerPrefetch'] } },
  routing: { packages: ['react-router',
    'react-router-dom',
    'vue-router',
    'next/router',
    'next/navigation',
    'next/link'] },
  'network-io': { globals: ['fetch',
    'XMLHttpRequest',
    'WebSocket',
    'EventSource'],
  globalMembers: { navigator: ['sendBeacon'] } },
  'browser-dom': { globals: ['window',
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
    'getComputedStyle'] },
};

it('declares exactly the public initial catalog', () => {
  expect(Object.keys(MUST_NOT_CAPABILITIES)).toEqual(Object.keys(expected));
});

it.each(Object.entries(expected))('publishes exact %s detector signals and bounded limitations',
  (id,
    signals) => {
    const { limitations, ...detectors } = MUST_NOT_CAPABILITIES[id as MustNotCapability];

    expect(detectors).toEqual(signals);

    expect(limitations).toContain('No delegated wrappers, dependency injection, '
      + 'application abstractions, '
      + 'runtime execution, or cross-file value flow are inferred.');

    const plan = resolveProhibitions({ name: 'domain', does: 'policy', mustNot: [{
      id: 'ban', description: 'Forbidden', checks: [{ capability: id as MustNotCapability }],
    }] }, { framework: 'framework' in signals ? signals.framework as 'react' | 'vue' : 'react' });

    expect(plan[0].checks[0]).toEqual({
      check: { capability: id }, status: 'available', unavailableReason: null, limitations,
    });

    expect(plan[0].limitations).toEqual(limitations);
  });
