import type { Rule } from 'eslint';
import type { Literal, ObjectExpression, Property } from 'estree';

/**
 * Disallow `watch(source, cb, { deep: true })` (Vue composition API). A deep
 * watch traverses the whole source on every change — cost = work × frequency,
 * and the frequency is invisible at the call site. Only the literal options
 * argument is checked; an options identifier cannot be proven deep statically.
 */
export const noDeepWatch: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow deep watches — they traverse the whole source on every change.',
    },
    schema: [],
    messages: {
      noDeep:
        '🚫 Deep watch traverses the whole source on every change (cost = work × frequency). '
        + 'Watch a specific path instead, or restructure the state.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'watch') return;

        const options = node.arguments[2];

        if (!options || options.type !== 'ObjectExpression') return;

        const deep = findDeepTrue(options);

        if (deep) context.report({ node: deep, messageId: 'noDeep' });
      },
    };
  },
};

/** The `deep: <truthy literal>` property of an options object, if present. */
function findDeepTrue(options: ObjectExpression): Property | undefined {
  return options.properties.find(
    (prop): prop is Property =>
      prop.type === 'Property'
      && !prop.computed
      && keyName(prop) === 'deep'
      && prop.value.type === 'Literal'
      && Boolean(prop.value.value),
  );
}

// A non-computed property key is always an Identifier or a Literal.
function keyName(prop: Property): string {
  return prop.key.type === 'Identifier' ? prop.key.name : String((prop.key as Literal).value);
}
