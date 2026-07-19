import type { Rule } from 'eslint';

/**
 * Exported functions in the layer this rule is attached to must carry the
 * hook prefix (`useX` by default). Only function-shaped named exports are
 * checked — types, plain constants, and re-export specifiers cannot be proven
 * hooks statically, so they pass rather than risk false positives.
 */
export const usePrefix: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Exported functions in this layer must carry the hook prefix.',
    },
    schema: [
      {
        type: 'object',
        properties: { prefix: { type: 'string' } },
        additionalProperties: false,
      },
    ],
    messages: {
      badName:
        '🚫 "{{name}}" is a function exported from this layer but is not '
        + '{{prefix}}-prefixed — name hooks {{prefix}}X, or move non-hook code to a lower layer.',
    },
  },
  create(context) {
    const prefix = (context.options[0] as { prefix?: string } | undefined)?.prefix ?? 'use';

    const isPrefixed = (name: string): boolean =>
      name.startsWith(prefix) && /[A-Z]/.test(name.charAt(prefix.length));

    const check = (name: string, node: Rule.Node): void => {
      if (!isPrefixed(name)) {
        context.report({ node, messageId: 'badName', data: { name, prefix } });
      }
    };

    return {
      ExportNamedDeclaration(node) {
        const declaration = node.declaration;

        if (!declaration) return;

        if (declaration.type === 'FunctionDeclaration') {
          check(declaration.id.name, declaration.id as Rule.Node);
        } else if (declaration.type === 'VariableDeclaration') {
          for (const declarator of declaration.declarations) {
            if (
              declarator.id.type === 'Identifier'
              && (declarator.init?.type === 'ArrowFunctionExpression'
                || declarator.init?.type === 'FunctionExpression')
            ) {
              check(declarator.id.name, declarator.id as Rule.Node);
            }
          }
        }
      },
    };
  },
};
