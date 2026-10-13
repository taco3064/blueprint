import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Linter } from 'eslint';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { plugin } from './plugin';
import { delegatedReactivity } from './delegated-reactivity';

const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();

  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function check(
  files: Record<string, string>,
  code = 'import { useData } from "./data"; export function useView() { return useData(); }',
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-hooks-'));

  roots.push(root);

  for (const [name, text] of Object.entries(files)) {
    const filename = path.join(root, name);

    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, text);
  }

  return new Linter({ cwd: root }).verify(code, {
    plugins: { blueprint: plugin },
    rules: { 'blueprint/use-prefix-needs-reactivity': 'error' },
  }, { filename: path.join(root, 'useView.js') });
}

const reactive = 'import { useState } from "react"; export function '
  + 'useData() { return useState(0); }';

describe('delegated hook evidence', () => {
  it.each(['ts', 'tsx', 'js', 'jsx', 'mjs'])('follows .%s implementations', (extension) => {
    expect(check({ [`data.${extension}`]: reactive })).toEqual([]);
  });

  it('follows an explicit extension', () => {
    expect(check({ 'data.ts': reactive }, 'import { useData } from "./data.ts"; export const '
    + 'useView = () => useData();')).toEqual([]);
  });

  it.each([
    'export { useData } from "./implementation";',
    'export * from "./implementation";',
    'import { useData } from "./implementation"; export { useData };',
  ])('follows a folder barrel: %s', (barrel) => {
    expect(check({ 'data/index.ts': barrel, 'data/implementation.ts': reactive })).toEqual([]);
  });

  it('follows renamed imports and exports', () => {
    expect(check({
      'data.ts': 'export { useInternal as useData } from "./internal";',
      'internal.ts': 'import { useState as state } from "react"; export '
        + 'const useInternal = () => state(0);',
    })).toEqual([]);
  });

  it('follows default export and local delegation', () => {
    expect(check({ 'data.ts': 'import React from "react"; const state = () => '
      + 'React.useState(0); export default function useData() { '
      + 'return state(); }' },
    'import data from "./data"; export default () => data();')).toEqual([]);
  });

  it('follows namespace hook imports', () => {
    expect(check({ 'data.ts': reactive }, 'import * as hooks from "./data"; export const useView '
    + '= () => hooks.useData();')).toEqual([]);
  });

  it('follows Vue primitive import evidence', () => {
    expect(check({ 'data.ts': 'import { ref } from "vue"; export const useData = () '
      + '=> ref(0);' })).toEqual([]);
  });

  it.each<Record<string, string>>([
    {},
    { 'data.ts': 'import { ref } from "react"; export const useData = () => ref(0);' },
    { 'data.ts': 'import { useState } from "vue"; export const useData = () => useState(0);' },
    { 'data.ts': 'import { useState } from "react";'
      + ' let helper = () => useState(0); helper = () => 1;'
      + ' export const useData = () => helper();' },

    { 'data.ts': 'export { x } from "./missing";' },
    { 'data.ts': 'export { useData } from "./missing";' },
    { 'data.ts': 'export * from "./missing";' },
    { 'data.ts': 'import type { useState } from "react";'
      + ' export const useData = () => useState();' },
    { 'data.ts': 'import { type useState } from "react";'
      + ' export const useData = () => useState();' },
    { 'data.ts': 'import { anything } from "react";'
      + ' export const useData = () => anything.useState();' },
    { 'data.ts': 'import * as hooks from "react"; export const useData = () => hooks();' },
    { 'data.ts': 'const hooks = {}; export const useData = () => hooks.useState();' },
    { 'data.ts': 'import * as hooks from "react";'
      + ' export const useData = () => hooks["useState"]();' },
    { 'data.ts': 'import { createElement } from "react";'
      + ' export const useData = () => createElement("div");' },

    { 'data.ts': 'export const useData = () => 1;' },
    { 'data.ts': 'const useState = () => 1; export const useData = () => useState();' },
    { 'data.ts': 'import { useState } from "other"; export const useData = () => useState();' },
    { 'data.ts': 'import { useState } from "react"; export const useData '
      + '= (useState) => useState();' },
    { 'data.ts': 'import { useState } from "react"; export function '
      + 'useData() { const unused = () => useState(0); return '
      + '1; }' },
    { 'data.ts': 'export const useData = () => useMissing();' },
    { 'data.ts': 'export { useData } from "./other";',
      'other.ts': 'export { useData } from "./data";' },
    { 'data.ts': 'export * from "./other";', 'other.ts': 'export * from "./data";' },
    { 'data.ts': 'broken ! syntax' },
    { 'data.ts': 'import { useState } from "react"; export const other = '
      + '() => useState(0); export const useData = () => 1;' },
    { 'data.ts': 'import { useState } from "react"; export const useData '
      + '= () => ({ useState: () => 1 }).useState();' },
  ])('keeps missing, fake, uncalled and cyclic delegation as an error: %j', (files) => {
    const result = check(files);

    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(2);
    expect(result[0].ruleId).toBe('blueprint/use-prefix-needs-reactivity');
  });
});

it('fails closed when the root source cannot be parsed', () => {
  expect(delegatedReactivity('useView.ts', 'not valid !', { apis: new Set() })).toBe(false);
});

it('does not invent a default export through export-star', () => {
  expect(check({ 'data.ts': 'export * from "./inner";', 'inner.ts': reactive },
    'import useData from "./data"; export const useView = () => useData();')).toHaveLength(1);
});

it('terminates local alias cycles and uninitialized variables', () => {
  boundRepeatedNodes();

  expect(check({}, 'const first = second; const second = first;'
  + ' let missing; export const useView = () => first() || missing();')).toHaveLength(1);
});

it.each([
  'import { useState } from "react"; export let useData = () => useState(0)[0];'
  + ' useData = () => 1;',
  'import { useState } from "react"; export function useData() { return useState(0); }'
  + ' useData = () => 1;',
])('rejects a reassigned exported hook binding: %s', (source) => {
  const result = check({ 'data.ts': source });

  expect(result.map(({ ruleId, severity }) => ({ ruleId, severity })))
    .toEqual([{ ruleId: 'blueprint/use-prefix-needs-reactivity', severity: 2 }]);
});

it.each([
  'export type { useData } from "./inner";',
  'export { type useData } from "./inner";',
  'export type * from "./inner";',
  'export * as ignoredNamespace from "./inner";',
  'export * as useData from "./inner";',
])('does not invent a callable named export from %s', (barrel) => {
  const result = check({ 'data.ts': barrel, 'inner.ts': reactive });

  expect(result.map(({ ruleId, severity }) => ({ ruleId, severity })))
    .toEqual([{ ruleId: 'blueprint/use-prefix-needs-reactivity', severity: 2 }]);
});

it('rejects a reassigned default function declaration', () => {
  const result = check({ 'data.ts': 'import { useState } from "react";'
    + ' export default function useData() { return useState(0); } useData = () => 1;' },
  'import useData from "./data"; export const useView = () => useData();');

  expect(result.map(({ ruleId, severity }) => ({ ruleId, severity })))
    .toEqual([{ ruleId: 'blueprint/use-prefix-needs-reactivity', severity: 2 }]);
});

it.each([
  'export default () => useState(0);',
  'const local = () => useState(0); export default local;',
])('keeps a genuine default hook callable: %s', (declaration) => {
  expect(check({ 'data.ts': `import { useState } from "react"; ${declaration}` },
    'import useData from "./data"; export const useView = () => useData();')).toEqual([]);
});

it.each([
  'export const useData = () => 1;',
  'export { useData } from "./pure";',
  'export { useData } from "./missing";',
])('explicit nonreactive or unresolved export wins over a reactive star: %s', (explicit) => {
  for (const barrel of [
    `${explicit} export * from "./inner";`,
    `export * from "./inner"; ${explicit}`,
  ]) {
    const result = check({
      'data.ts': barrel,
      'inner.ts': reactive,
      'pure.ts': 'export const useData = () => 1;',
    });

    expect(result.map(({ ruleId, severity }) => ({ ruleId, severity })))
      .toEqual([{ ruleId: 'blueprint/use-prefix-needs-reactivity', severity: 2 }]);
  }
});

it.each([
  'export const useData = () => 1;',
  reactive,
])('rejects distinct competing star bindings even when either is reactive: %s', (other) => {
  for (const barrel of [
    'export * from "./inner"; export * from "./other";',
    'export * from "./other"; export * from "./inner";',
  ]) {
    const result = check({ 'data.ts': barrel, 'inner.ts': reactive, 'other.ts': other });

    expect(result.map(({ ruleId, severity }) => ({ ruleId, severity })))
      .toEqual([{ ruleId: 'blueprint/use-prefix-needs-reactivity', severity: 2 }]);
  }
});

it('preserves one callable binding reached by multiple barrel paths', () => {
  expect(check({
    'data.ts': 'export * from "./left"; export * from "./right";',
    'left.ts': 'export { useData } from "./inner";',
    'right.ts': 'import { useData as local } from "./inner"; export { local as useData };',
    'inner.ts': reactive,
  })).toEqual([]);
});

it('propagates ambiguous star resolution through another barrel', () => {
  const result = check({
    'data.ts': 'export * from "./barrel"; export * from "./inner";',
    'barrel.ts': 'export * from "./inner"; export * from "./other";',
    'inner.ts': reactive,
    'other.ts': reactive,
  });

  expect(result.map(({ ruleId, severity }) => ({ ruleId, severity })))
    .toEqual([{ ruleId: 'blueprint/use-prefix-needs-reactivity', severity: 2 }]);
});

it('resolves an imported default hook reexport to its original binding', () => {
  expect(check({
    'data.ts': 'import local from "./inner"; export { local as useData };',
    'inner.ts': 'import { useState } from "react"; export default () => useState(0);',
  })).toEqual([]);
});

it('keeps imported framework primitive reexports as callable evidence', () => {
  expect(check({ 'data.ts': 'import { useState as local } from "react";'
    + ' export { local as useData };' })).toEqual([]);
});

it.each([
  'import * as local from "./inner"; export { local as useData };',
  'import type { useData } from "./inner"; export { useData };',
  'export { missing as useData };',
])('does not turn unresolved local exports into evidence: %s', (barrel) => {
  const result = check({ 'data.ts': barrel, 'inner.ts': reactive });

  expect(result.map(({ ruleId, severity }) => ({ ruleId, severity })))
    .toEqual([{ ruleId: 'blueprint/use-prefix-needs-reactivity', severity: 2 }]);
});

it.each([
  'export const { useData } = { useData: () => 1 };',
  'export const { value: useData } = { value: () => 1 };',
  'export const { nested: { useData } } = { nested: { useData: () => 1 } };',
  'export const { useData = () => 1 } = {};',
  'export const { unused, ...useData } = {};',
  'export const [useData] = [() => 1];',
  'export const [, useData] = [null, () => 1];',
  'export const [useData = () => 1] = [];',
  'export const [...useData] = [];',
  'export const [{ value: useData = () => 1 }] = [{}];',
  'export const { nested: [useData] } = { nested: [() => 1] };',
  'export const { ["dynamic"]: useData } = { dynamic: () => 1 };',
  'const pure = () => 1; export { pure as "useData" };',
  'export { pure as "useData" } from "./pure";',
  'export * as "useData" from "./inner";',
  'export class useData {}',
  'export enum useData { value }',
])('never falls through an explicit binding pattern to a reactive star: %s', (explicit) => {
  for (const barrel of [
    `${explicit} export * from "./inner";`,
    `export * from "./inner"; ${explicit}`,
  ]) {
    const result = check({
      'data.ts': barrel,
      'inner.ts': reactive,
      'pure.ts': 'export const pure = () => 1;',
    });

    expect(result.map(({ ruleId, severity }) => ({ ruleId, severity })))
      .toEqual([{ ruleId: 'blueprint/use-prefix-needs-reactivity', severity: 2 }]);
  }
});

it('does not confuse an object pattern key with its exported binding name', () => {
  expect(check({
    'data.ts': 'export const { useData: other } = { useData: () => 1 };'
      + ' export * from "./inner";',
    'inner.ts': reactive,
  })).toEqual([]);
});

it.each([
  'const { useData } = () => useState(0); export { useData };',
  'const [local] = () => useState(0); export const useData = () => local();',
])('does not treat a destructuring initializer as its callable bound value: %s', (source) => {
  const result = check({ 'data.ts': `import { useState } from "react"; ${source}` });

  expect(result.map(({ ruleId, severity }) => ({ ruleId, severity })))
    .toEqual([{ ruleId: 'blueprint/use-prefix-needs-reactivity', severity: 2 }]);
});

it.each([
  'export const {useData} = {useData: () => 1};',
  'export let useData = () => 1; useData = () => 2;',
  'export * as useData from "./inner";',
  'export {useData} from "./missing";',
])('reports ambiguous noncallable star exports as errors: %s', (terminal) => {
  for (const order of [['pure', 'inner'], ['inner', 'pure']]) {
    const messages = check({
      'data.ts': order.map((name) => `export * from "./${name}";`).join(''),
      'pure.ts': terminal,
      'inner.ts': reactive,
    });

    expect(messages).toHaveLength(1);

    expect(messages[0]).toMatchObject({
      severity: 2,
      ruleId: 'blueprint/use-prefix-needs-reactivity',
    });
  }
});

function boundRepeatedNodes() {
  const add = Set.prototype.add;
  const visits = new WeakMap<object, number>();

  vi.spyOn(Set.prototype, 'add').mockImplementation(function (this: Set<unknown>, value: unknown) {
    if (typeof value === 'object' && value !== null && 'type' in value) {
      const count = (visits.get(value) ?? 0) + 1;

      visits.set(value, count);

      if (count > 4) {
        throw new Error('Recursive delegation revisited the same node without making progress');
      }
    }

    return add.call(this, value);
  });
}

it('rejects recursive arrow hooks without repeated traversal', () => {
  boundRepeatedNodes();

  expect(check({ 'data.ts': 'export const useData = () => useData();' }))
    .toEqual([expect.objectContaining({ severity: 2,
      ruleId: 'blueprint/use-prefix-needs-reactivity' })]);
});

it.each([
  ['react', 'useState'], ['vue', 'ref'],
])('retains actual %s primitive bindings through local export aliases', (framework, primitive) => {
  expect(check({
    'data.ts': `import { ${primitive} as useData } from "${framework}"; export { useData };`,
  })).toEqual([]);
});
