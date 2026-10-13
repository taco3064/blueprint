import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { delegatedReactivity } from './delegated-reactivity';

const directories: string[] = [];
const reactive = 'import { useState } from "react"; export const useData = () => useState(0);';
const app = 'import { useData } from "./data"; export const useView = () => useData();';

afterEach(() => {
  vi.restoreAllMocks();

  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function evidence(files: Record<string, string>, source = app, filename = 'useView.ts') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-delegation-evidence-'));

  directories.push(directory);

  for (const [name, content] of Object.entries(files)) {
    const destination = path.join(directory, name);

    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  }

  return delegatedReactivity(path.join(directory, filename), source, new Set(['useState']));
}

it('does not mistake a bare package import for a same-named adjacent module', () => {
  expect(evidence({ 'package.ts': reactive },
    'import { useData } from "package"; export const useView = () => useData();')).toBe(false);
});

it('chooses the requested name from multiple exported specifiers', () => {
  expect(evidence({ 'data.ts': 'const pure = () => 1; import { useState } from "react";'
    + 'const live = () => useState(0); export { pure, live as useData };' })).toBe(true);
});

it('does not use a default reactive export as evidence for a named pure export', () => {
  expect(evidence({ 'data.ts': 'import { useState } from "react";'
    + ' export default () => useState(0); export const useData = () => 1;' })).toBe(false);
});

it('does not inherit default exports through export-star', () => {
  expect(evidence({ 'data.ts': 'export * from "./inner";',
    'inner.ts': 'import { useState } from "react"; export default () => useState(0);' },
  'import useData from "./data"; export const useView = () => useData();')).toBe(false);
});

it('preserves the same binding identity across local export specifiers', () => {
  expect(evidence({
    'data.ts': 'export * from "./left"; export * from "./right";',
    'left.ts': 'export { useData } from "./inner";',
    'right.ts': 'export { alias as useData } from "./inner";',
    'inner.ts': 'import { useState } from "react";'
      + 'const live = () => useState(0); export { live as useData, live as alias };',
  })).toBe(true);
});

it('finds one explicit binding among multiple declarations', () => {
  expect(evidence({ 'data.ts': 'export const other = 0, useData = () => 1;'
    + 'export * from "./inner";', 'inner.ts': reactive })).toBe(false);
});

it('passes unrelated declaration kinds when finding a later named export', () => {
  expect(evidence({ 'data.ts': 'export class Other {}\n' + reactive })).toBe(true);
});

it('does not treat a hole in a destructuring pattern as every possible exported name', () => {
  expect(evidence({ 'data.ts': 'export const [, other] = []; export * from "./inner";',
    'inner.ts': reactive })).toBe(true);
});

it('does not treat an initializer invocation as an exported hook function', () => {
  expect(evidence({ 'data.ts': 'import { useState } from "react";'
    + ' const factory = () => useState(0); export const useData = factory();' })).toBe(false);
});

it.each(['jsx', 'tsx'])('parses actual JSX in delegated .%s implementations', (extension) => {
  expect(evidence({ [`data.${extension}`]: 'import { useState } from "react";'
    + ' export const useData = () => { useState(0); return <span />; };' })).toBe(true);
});

it('propagates a later ambiguous star even when an earlier star has the same origin', () => {
  expect(evidence({
    'data.ts': 'export * from "./inner"; export * from "./barrel";',
    'barrel.ts': 'export * from "./inner"; export * from "./other";',
    'inner.ts': reactive,
    'other.ts': reactive,
  })).toBe(false);
});

it('does not follow a reassigned local import while resolving a reexport', () => {
  expect(evidence({ 'data.ts': 'import { useData } from "./inner";'
    + ' useData = () => 1; export { useData };', 'inner.ts': reactive })).toBe(false);
});

it('rejects invoking a relative namespace import itself', () => {
  expect(evidence({ 'data.ts': reactive },
    'import * as useData from "./data"; export const useView = () => useData();')).toBe(false);
});

it('does not treat a private class-field access as a framework primitive', () => {
  expect(evidence({ 'data.ts': 'import React from "react"; export function useData() {'
    + ' class Holder { #useState; field = React.#useState(); } return Holder; }' })).toBe(false);
});

it('handles null child nodes in a nonreactive function body', () => {
  expect(evidence({ 'data.ts': 'export function useData() { return; }' })).toBe(false);
});

it('does not enable JSX for a non-JSX file with a similar middle extension', () => {
  expect(evidence({ 'data.jsx.extra': 'import { useState } from "react";'
    + 'export const useData = () => { useState(0); return <span />; };' },
  'import { useData } from "./data.jsx.extra"; export const useView = () => useData();'))
    .toBe(false);
});

it('terminates export cycles within a bounded number of resolution reads', () => {
  const exists = fs.existsSync;
  let reads = 0;

  vi.spyOn(fs, 'existsSync').mockImplementation((file) => {
    if (++reads > 12) {
      throw new Error('Cyclic exports repeated filesystem resolution without making progress');
    }

    return exists(file);
  });

  expect(evidence({ 'data.ts': 'export { useData } from "./inner";',
    'inner.ts': 'export { useData } from "./data";' })).toBe(false);
});

it('terminates local call cycles without repeatedly entering the same function', () => {
  const add = Set.prototype.add;
  const visits = new WeakMap<object, number>();

  vi.spyOn(Set.prototype, 'add').mockImplementation(function (this: Set<unknown>, value: unknown) {
    if (typeof value === 'object' && value !== null && 'type' in value
      && value.type === 'FunctionDeclaration') {
      const count = (visits.get(value) ?? 0) + 1;

      visits.set(value, count);

      if (count > 4) {
        throw new Error('A recursive call graph entered the same function without making progress');
      }
    }

    return add.call(this, value);
  });

  expect(evidence({ 'data.ts': 'export function useData() { return useData(); }' })).toBe(false);
});

const terminalBindings = [
  'export const {useData} = {useData: () => 1};',
  'export const [useData] = [() => 1];',
  'export const {nested: {alias: useData = () => 1}} = {nested: {}};',
  'export const [...useData] = [];',
  'export const {other, ...useData} = {};',
  'export let useData = () => 1; useData = () => 2;',
  'import {useData} from "./inner"; useData = () => 1; export {useData};',
  'export * as useData from "./inner";',
  'import * as useData from "./inner"; export {useData};',
  'export {useData} from "./missing";',
  'export {missing as useData} from "./inner";',
];

it.each(terminalBindings)('retains terminal identity for star ambiguity: %s', (terminal) => {
  for (const order of [['pure', 'inner'], ['inner', 'pure']]) {
    expect(evidence({
      'data.ts': order.map((name) => `export * from "./${name}";`).join(''),
      'pure.ts': terminal,
      'inner.ts': reactive,
    })).toBe(false);
  }
});

it('traces a default import reexported under a named hook binding', () => {
  expect(evidence({
    'data.ts': 'import live from "./inner"; export {live as useData};',
    'inner.ts': 'import {useState} from "react"; export default () => useState(0);',
  })).toBe(true);
});

it('accepts one reactive initializer among multiple root declarations', () => {
  expect(evidence({ 'data.ts': reactive },
    'import {useData} from "./data"; export const other = () => 1, useView = () => useData();'))
    .toBe(true);
});
