import { Linter } from 'eslint';
import type { Rule } from 'eslint';
import { describe, expect, it } from 'vitest';
import { importedIdentity, nodeName, reactClass } from './must-not-bindings';
import type { ProhibitionNode } from './must-not-bindings';

function inspect(code: string, listener: (context: Rule.RuleContext) => Rule.RuleListener) {
  return new Linter().verify(code, [{
    plugins: { probe: { rules: { bindings: { create: listener } } } },
    rules: { 'probe/bindings': 'error' },
  }]);
}

describe('must-not binding identity', () => {
  it.each([42, null, true])('does not return non-string literal identity %s', (value) => {
    expect(nodeName({ type: 'Literal', value })).toBeNull();
  });

  it('preserves default, namespace and named import identities', () => {
    const identities: unknown[] = [];

    expect(inspect('import Default, * as Namespace from "react";'
      + 'import {useState as Named} from "react"; Default(); Namespace(); Named();',
    (context) => ({
      CallExpression(node) {
        identities.push(importedIdentity(context, node.callee as unknown as ProhibitionNode));
      },
    }))).toEqual([]);

    expect(identities).toEqual([
      { package: 'react', name: 'default' },
      { package: 'react', name: '*' },
      { package: 'react', name: 'useState' },
    ]);
  });

  it('returns no identity for a non-identifier expression without scope lookup', () => {
    expect(importedIdentity({} as Rule.RuleContext, { type: 'ThisExpression' })).toBeNull();
  });
});

describe('must-not React ancestry', () => {
  it('terminates an ancestor walk within a bounded number of ancestor inspections', () => {
    let result: boolean | undefined;

    expect(inspect('import {Component} from "react";'
      + 'class X extends Component { f() { if (true) { this.setState({}); } } }',
    (context) => ({
      MemberExpression(node) {
        const ancestors: { node: ProhibitionNode; descriptor: PropertyDescriptor }[] = [];
        let ancestor = node.parent as unknown as ProhibitionNode | undefined;
        let inspections = 0;

        while (ancestor) {
          const current = ancestor;
          const descriptor = Object.getOwnPropertyDescriptor(current, 'type')!;
          const type = current.type;

          ancestors.push({ node: current, descriptor });

          Object.defineProperty(current, 'type', {
            configurable: true,
            get() {
              if (++inspections > 64) {
                throw new Error('React ancestry traversal did not make bounded progress');
              }

              return type;
            },
          });

          ancestor = current.parent;
        }

        try {
          result = reactClass(context, node as unknown as ProhibitionNode);
        } finally {
          for (const entry of ancestors) {
            Object.defineProperty(entry.node, 'type', entry.descriptor);
          }
        }
      },
    }))).toEqual([]);

    expect(result).toBe(true);
  });

  it('returns false at an absent class ancestor', () => {
    expect(reactClass({} as Rule.RuleContext, { type: 'MemberExpression' })).toBe(false);
  });

  it('returns false at a detached function boundary', () => {
    expect(reactClass({} as Rule.RuleContext, {
      type: 'MemberExpression', parent: { type: 'FunctionExpression' },
    })).toBe(false);
  });
});
