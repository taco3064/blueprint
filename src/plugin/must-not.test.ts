import tsParser from '@typescript-eslint/parser';
import { Linter } from 'eslint';
import vueParser from 'vue-eslint-parser';
import { describe, expect, it } from 'vitest';
import { resolveProhibitions } from '../config';
import type { Framework, MustNotCheck } from '../config';
import { mustNot } from './must-not';

function lint(code: string, check: MustNotCheck, options: {
  filename?: string; framework?: Framework;
} = {}) {
  const { filename = 'src/domain/unit.ts', framework = 'react' } = options;

  const prohibitions = resolveProhibitions({
    name: 'domain', does: 'policy',
    mustNot: [{ id: 'test-ban', description: 'keep policy pure', checks: [check] }],
  }, { framework });

  return new Linter().verify(code, [{
    files: ['**/*.{ts,tsx,vue}'],
    languageOptions: {
      parser: filename.endsWith('.vue') ? vueParser : tsParser,
      parserOptions: { parser: tsParser, ecmaFeatures: { jsx: true } },
    },
    plugins: { blueprint: { rules: { 'must-not': mustNot } } },
    rules: { 'blueprint/must-not': ['error', { prohibitions }] },
  }], { filename });
}

describe('must-not project checks', () => {
  it.each([
    'import x from "leaflet"',
    'import * as x from "leaflet/sub"',
    'import {x as y} from "leaflet"',
    'import type {X} from "leaflet"',
    'export {x as y} from "leaflet"',
    'export type {X} from "leaflet"',
    'export * from "leaflet"',
    'const x = require("leaflet/sub")',
    'const p = "leaflet"; import(p)',
    'import("leaf" + "let/sub")',
    'import x = require("leaflet")',
    'type T = import("leaflet").Thing',
  ])('detects package reference %s', (source) => {
    expect(lint(source, { package: 'leaflet' })).toMatchObject([
      { ruleId: 'blueprint/must-not', severity: 2, message: expect.stringContaining('test-ban') },
    ]);
  });

  it.each([
    'import x from "leaflet-extra"',
    'import x from "other/leaflet"',
    'import(runtime)',
    'require(runtime)',
    'function f(require: (s: string) => unknown) { require("leaflet") }',
    'const x = "leaflet";',
    'export const x = 1;',
  ])('does not invent package identity for %s', (source) => {
    expect(lint(source, { package: 'leaflet' })).toEqual([]);
  });

  it.each(['@org/pkg', '@org/pkg/sub'])('matches scoped family %s', (source) => {
    expect(lint(`import '${source}'`, { package: '@org/pkg' })).toHaveLength(1);
  });

  it('keeps scoped siblings and explicit patterns distinct', () => {
    expect(lint('import "@org/pkg-extra"', { package: '@org/pkg' })).toEqual([]);
    expect(lint('import "leaflet/sub"', { package: 'leaf*', pattern: true })).toHaveLength(1);
    expect(lint('import "leaflet"', { package: 'leaflet/*', pattern: true })).toEqual([]);
    expect(lint('import "other"', { package: 'leaf*', pattern: true })).toEqual([]);
  });

  it.each([
    'import { divIcon as icon } from "leaflet"',
    'export { divIcon as icon } from "leaflet"',
    'import type { divIcon } from "leaflet"',
    'export type { divIcon } from "leaflet"',
    'import type { divIcon as Icon } from "leaflet"',
    'export type { divIcon as Icon } from "leaflet"',
    'import { type divIcon as Icon } from "leaflet"',
    'export { type divIcon as Icon } from "leaflet"',
  ])('covers named static symbols %s', (source) => {
    expect(lint(source, { package: 'leaflet', imports: ['divIcon'] })).toHaveLength(1);
  });

  it.each([
    'import {other} from "leaflet"', 'import X from "leaflet"',
    'require("leaflet").divIcon()', 'import("leaflet")',
    'import { other as divIcon } from "leaflet"',
    'export { other as divIcon } from "leaflet"',
    'import type { other as divIcon } from "leaflet"',
    'export type { other as divIcon } from "leaflet"',
  ])('does not infer named symbols outside static references %s', (source) => {
    expect(lint(source, { package: 'leaflet', imports: ['divIcon'] })).toEqual([]);
  });

  it.each([
    'import * as L from "leaflet"; L.other()',
    'import * as L from "leaflet"; L.divIcon()',
    'import type * as L from "leaflet"',
    'export * from "leaflet"',
    'export * as L from "leaflet"',
    'export type * from "leaflet"',
    'export type * as L from "leaflet"',
  ])('requires a whole-package ban for namespace references %s', (source) => {
    expect(lint(source, { package: 'leaflet', imports: ['divIcon'] })).toEqual([]);
    expect(lint(source, { package: 'leaflet', imports: ['default'] })).toEqual([]);

    expect(lint(source, { package: 'leaflet' })).toMatchObject([
      { ruleId: 'blueprint/must-not', severity: 2 },
    ]);
  });

  it.each([
    'import Icon from "leaflet"',
    'import type Icon from "leaflet"',
    'import { default as Icon } from "leaflet"',
    'export { default as Icon } from "leaflet"',
    'export type { default as Icon } from "leaflet"',
  ])('matches default by exported name %s', (source) => {
    expect(lint(source, { package: 'leaflet', imports: ['default'] })).toHaveLength(1);
  });
});

describe('must-not global and call checks', () => {
  it.each(['WebSocket', 'new WebSocket("x")', 'type Socket = WebSocket'])(
    'finds global reference %s', (source) => {
      expect(lint(source, { global: 'WebSocket' })).toHaveLength(1);
    });

  it.each([
    'const WebSocket = 1; void WebSocket',
    'function f(WebSocket: number) { return WebSocket }',
    'type WebSocket = string; let x: WebSocket;',
    'const x = { WebSocket: 1 }',
    'obj.WebSocket', 'WebSocket: for (;;) { break WebSocket }',
    'const x = "WebSocket"',
  ])('ignores non-global reference %s', (source) => {
    expect(lint(source, { global: 'WebSocket' })).toEqual([]);
  });

  it.each(['divIcon()', 'divIcon?.()', 'L.divIcon()', 'L?.divIcon?.()', 'L[\'divIcon\']()'])(
    'matches syntactic calls %s', (source) => {
      expect(lint(source, { call: 'divIcon' })).toMatchObject([
        { message: expect.stringContaining('syntactic') },
      ]);
    },
  );

  it.each([
    'new divIcon()', 'L[name]()', 'L["div" + "Icon"]()', 'other()',
    'const icon = divIcon; icon()', '(first || second)()', 'obj[42]()',
  ])(
    'ignores unsupported call identity %s', (source) => {
      expect(lint(source, { call: 'divIcon' })).toEqual([]);
    },
  );
});

describe('must-not framework bindings', () => {
  it.each([
    ['react-state', 'react', 'useState'], ['react-state', 'react', 'useReducer'],
    ['react-state', 'react', 'useSyncExternalStore'],
    ['react-lifecycle', 'react', 'useEffect'], ['react-lifecycle', 'react', 'useLayoutEffect'],
    ['react-lifecycle', 'react', 'useInsertionEffect'],
    ['vue-reactivity', 'vue', 'ref'], ['vue-reactivity', 'vue', 'shallowRef'],
    ['vue-reactivity', 'vue', 'reactive'], ['vue-reactivity', 'vue', 'shallowReactive'],
    ['vue-reactivity', 'vue', 'customRef'], ['vue-reactivity', 'vue', 'computed'],
    ['vue-reactivity', 'vue', 'toRef'], ['vue-reactivity', 'vue', 'toRefs'],
    ['vue-lifecycle', 'vue', 'onBeforeMount'], ['vue-lifecycle', 'vue', 'onMounted'],
    ['vue-lifecycle', 'vue', 'onBeforeUpdate'], ['vue-lifecycle', 'vue', 'onUpdated'],
    ['vue-lifecycle', 'vue', 'onBeforeUnmount'], ['vue-lifecycle', 'vue', 'onUnmounted'],
    ['vue-lifecycle', 'vue', 'onActivated'], ['vue-lifecycle', 'vue', 'onDeactivated'],
    ['vue-lifecycle', 'vue', 'onErrorCaptured'], ['vue-lifecycle', 'vue', 'onRenderTracked'],
    ['vue-lifecycle', 'vue', 'onRenderTriggered'], ['vue-lifecycle', 'vue', 'onServerPrefetch'],
    ['render-ui', 'react', 'createElement'],
    ['render-ui', 'vue', 'h'], ['render-ui', 'vue', 'createVNode'],
  ] as const)('binds %s to %s.%s aliases and namespaces', (capability, pkg, name) => {
    const check = { capability };

    expect(lint(
      `import {${name} as bound} from '${pkg}'; bound()`, check,
      { framework: pkg },
    )).toHaveLength(1);

    expect(lint(
      `import * as P from '${pkg}'; P.${name}()`, check,
      { framework: pkg },
    )).toHaveLength(1);

    expect(lint(
      `import P from '${pkg}'; P['${name}']()`, check,
      { framework: pkg },
    )).toHaveLength(1);

    expect(lint(`function ${name}() {}; ${name}()`, check, { framework: pkg })).toEqual([]);

    expect(lint(
      `import {${name}} from '${pkg}'; function f(${name}: Function) { ${name}() }`, check,
      { framework: pkg },
    )).toEqual([]);
  });

  it.each(['<div/>', '<><span/></>'])('detects JSX %s', (source) => {
    expect(lint(
      `const ui = ${source}`, { capability: 'render-ui' },
      { filename: 'src/domain/u.tsx' }).length).toBeGreaterThan(0);
  });

  it.each(['<div/>', '<Widget/>', '{{ message }}', 'hello'])(
    'detects renderable Vue template %s', (source) => {
      expect(lint(
        `<template>${source}</template>`, { capability: 'render-ui' },
        { filename: 'src/domain/u.vue', framework: 'vue' }).length).toBeGreaterThan(0);
    });

  it.each(['', '  ', '<!-- nothing -->'])('allows empty Vue template %s', (source) => {
    expect(lint(
      `<template>${source}</template>`, { capability: 'render-ui' },
      { filename: 'src/domain/u.vue', framework: 'vue' },
    )).toEqual([]);
  });

  it('keeps project call checks in script blocks only', () => {
    expect(lint(
      '<template>{{ divIcon() }}</template>', { call: 'divIcon' },
      { filename: 'src/domain/u.vue', framework: 'vue' },
    )).toEqual([]);

    expect(lint(
      '<script setup>divIcon()</script>', { call: 'divIcon' },
      { filename: 'src/domain/u.vue', framework: 'vue' },
    )).toHaveLength(1);
  });

  it.each([
    ['render-ui', 'render() {}'], ['react-state', 'state = {}'],
    ['react-state', 'constructor() { super(); this.state = {}; }'],
    ['react-state', 'f() { this.setState({}) }'],
    ...['componentDidMount', 'componentDidUpdate', 'componentWillUnmount', 'shouldComponentUpdate',
      'getSnapshotBeforeUpdate', 'getDerivedStateFromProps', 'getDerivedStateFromError',
      'componentDidCatch',
      'componentWillMount', 'componentWillReceiveProps', 'componentWillUpdate',
      'UNSAFE_componentWillMount',
      'UNSAFE_componentWillReceiveProps', 'UNSAFE_componentWillUpdate'].map((method) => [
      'react-lifecycle', `${method}() {}`]),
  ])('requires proven React class for %s / %s', (capability, body) => {
    const check = { capability } as MustNotCheck;

    expect(lint(
      `import {Component as Base} from 'react'; class X extends Base { ${body} }`, check,
    )).toHaveLength(1);

    expect(lint(
      `import React from 'react'; class X extends React.PureComponent { ${body} }`, check,
    )).toHaveLength(1);

    expect(lint(`class Base {}; class X extends Base { ${body} }`, check)).toEqual([]);
    expect(lint(`class X { ${body.replace('super();', '')} }`, check)).toEqual([]);
  });
});

describe('must-not platform catalog', () => {
  it.each([
    'react-router', 'react-router-dom', 'vue-router', 'next/router', 'next/navigation', 'next/link',
  ])(
    'covers routing family %s', (pkg) => {
      expect(lint(`import '${pkg}/sub'`, { capability: 'routing' })).toHaveLength(1);
      expect(lint(`import '${pkg}-extra'`, { capability: 'routing' })).toEqual([]);
    },
  );

  it.each(['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'])(
    'covers network global %s', (name) => {
      expect(lint(`void ${name}`, { capability: 'network-io' })).toHaveLength(1);

      expect(lint(
        `function f(${name}: unknown) { return ${name} }`, { capability: 'network-io' },
      )).toEqual([]);
    },
  );

  it.each(['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'EventTarget',
    'CustomEvent', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'localStorage',
    'sessionStorage', 'location', 'history', 'customElements', 'getComputedStyle'])(
    'covers DOM global %s', (name) => {
      expect(lint(`void ${name}`, { capability: 'browser-dom' })).toHaveLength(1);
      expect(lint(`const ${name} = 1; void ${name}`, { capability: 'browser-dom' })).toEqual([]);
    },
  );

  it('requires unshadowed navigator and exact sendBeacon member', () => {
    expect(lint('navigator.sendBeacon("x")', { capability: 'network-io' })).toHaveLength(1);
    expect(lint('navigator["sendBeacon"]', { capability: 'network-io' })).toHaveLength(1);
    expect(lint('navigator.other()', { capability: 'network-io' })).toEqual([]);

    expect(lint(
      'function f(navigator: any) { navigator.sendBeacon() }', { capability: 'network-io' },
    )).toEqual([]);
  });
});

describe('must-not bounded identity controls', () => {
  it.each([
    'import { useState } from "other"; useState()',
    'import { useState } from "react"; useState = other; useState()',
    'import { useState } from "react"; useState.member()',
    'import React from "react"; React[name]()',
    'import React from "react"; React.useState.member()',
    '(function() {})()',
  ])('does not infer framework identity through %s', (code) => {
    expect(lint(code, { capability: 'react-state' })).toEqual([]);
  });

  it.each([
    'class X extends Base { [name]() {} }',
    'class X extends Base { render = 1 }',
    'class X extends Base { other() {} }',
    'class X extends Base { f() { return this.state } }',
    'class X extends Base { f() { obj.state = {}; } }',
    'class X extends Base { f() { function x() { this.setState({}) } } }',
    'class X extends Base { f() { const x = function() { this.setState({}) } } }',
    'class X extends Base { f() { const x = { m() { this.setState({}) } } } }',
    'class X extends Base { f() { class Y { m() { this.setState({}) } } } }',
  ])('does not infer React instance behavior in %s', (body) => {
    const code = `import { Component as Base } from 'react'; ${body}`;

    expect(lint(code, { capability: 'react-state' })).toEqual([]);
    expect(lint(code, { capability: 'render-ui' })).toEqual([]);
  });

  it('recognizes computed literal class methods and lexical arrow instance state', () => {
    expect(lint(`import {Component} from 'react';
      const X = class extends Component { ['render']() {} };`, { capability: 'render-ui' }))
      .toHaveLength(1);

    expect(lint(`import {Component} from 'react';
      class X extends Component { f = () => this.setState({}) }`, { capability: 'react-state' }))
      .toHaveLength(1);
  });
});

describe('must-not Vue script and template boundaries', () => {
  it('ignores directives on empty grouping templates', () => {
    expect(lint('<template><template v-if="show"></template></template>', {
      capability: 'render-ui',
    }, { filename: 'src/domain/u.vue', framework: 'vue' })).toEqual([]);
  });

  it('does not turn template expressions into program package calls', () => {
    expect(lint('<template>{{ importSomething() }}</template>', { package: 'leaflet' }, {
      filename: 'src/domain/u.vue', framework: 'vue',
    })).toEqual([]);

    expect(lint('<script setup>import x from "leaflet"</script>', { package: 'leaflet' }, {
      filename: 'src/domain/u.vue', framework: 'vue',
    })).toHaveLength(1);
  });
});
