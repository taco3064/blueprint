import type { Rule } from 'eslint';
import { describe, expect, it } from 'vitest';
import { capabilityMatch } from './must-not-capability';
import type { ProhibitionNode } from './must-not-bindings';

const context = {} as Rule.RuleContext;

describe('must-not template node boundaries', () => {
  it.each<ProhibitionNode>([
    { type: 'VExpressionContainer', expression: null, parent: { type: 'VElement' } },
    { type: 'VExpressionContainer', expression: { type: 'Identifier', name: 'label' } },
    { type: 'VText', value: null },
    { type: 'Literal', value: 'script text' },
  ])('does not invent render evidence from %j', (node) => {
    expect(capabilityMatch(context, node, 'render-ui')).toBe(false);
  });

  it('does not infer a state write without an assignment parent', () => {
    expect(capabilityMatch(context, {
      type: 'MemberExpression',
      object: { type: 'ThisExpression' },
      property: { type: 'Identifier', name: 'state' },
      computed: false,
    }, 'react-state')).toBe(false);
  });
});
