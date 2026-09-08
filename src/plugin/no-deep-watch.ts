import type { Rule } from 'eslint';
import type { Literal, ObjectExpression, Property } from 'estree';

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
        // Stryker disable next-line ConditionalExpression: the name guard still rejects it.
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'watch') {
          return;
        }

        const options = node.arguments[2];

        if (!options || options.type !== 'ObjectExpression') {
          return;
        }

        const deep = findDeepTrue(options);

        if (deep) {
          context.report({ node: deep, messageId: 'noDeep' });
        }
      },
    };
  },
};

function findDeepTrue(options: ObjectExpression): Property | undefined {
  return options.properties.find(
    (prop): prop is Property =>
      prop.type === 'Property'
      && !prop.computed
      && keyName(prop) === 'deep'
      && (
        // Stryker disable next-line ConditionalExpression: the truthiness guard still rejects it.
        prop.value.type === 'Literal'
      )
      && Boolean(prop.value.value),
  );
}

function keyName(prop: Property): string {
  return prop.key.type === 'Identifier' ? prop.key.name : String((prop.key as Literal).value);
}
