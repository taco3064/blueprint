import path from 'node:path';
import { minimatch } from 'minimatch';
import type { Rule } from 'eslint';
import type { MustNotCheck, ResolvedProhibition } from '../config';
import { renderMustNotViolation } from '../operational-contract';
import { child, globalReference, terminalName } from './must-not-bindings';
import type { ProhibitionNode } from './must-not-bindings';
import { capabilityMatch } from './must-not-capability';
import { packageMatch } from './must-not-package';

export const mustNot: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Enforce the resolved layer prohibition plan.' },
    schema: [{ type: 'object', additionalProperties: true }],
    messages: { violation: '{{message}}' },
  },
  create(context) {
    const options = context.options[0] as {
      prohibitions: ResolvedProhibition[];
      basePath?: string;
    };

    const relative = path.relative(
      path.resolve(context.cwd, options.basePath ?? '.'), context.filename,
    ).replaceAll('\\', '/');

    const prohibitions = options.prohibitions.filter((entry) => entry.mode === 'executable'
      && !entry.exempt.some((glob) => minimatch(relative, glob, { dot: true })));

    const visit = (node: ProhibitionNode): void => {
      for (const entry of prohibitions) {
        const matched = entry.checks.find((check) => check.status === 'available'
          && matches(context, node, check.check));

        if (!matched) {
          continue;
        }

        context.report({
          node: node as Rule.Node,
          messageId: 'violation',
          data: { message: renderMustNotViolation(
            { layer: entry.layer, id: entry.id!, description: entry.description }, matched.check,
          ) },
        });
      }
    };

    const listeners = Object.fromEntries([
      'ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression',
      'TSExternalModuleReference', 'TSImportType', 'CallExpression', 'Identifier',
      'MemberExpression', 'JSXElement', 'JSXFragment',
      'MethodDefinition', 'PropertyDefinition',
    ].map((name) => [name, visit])) as Rule.RuleListener;

    const services = context.sourceCode.parserServices as {
      defineTemplateBodyVisitor?: (
        template: object, script: Rule.RuleListener,
      ) => Rule.RuleListener;
    };

    return services.defineTemplateBodyVisitor
      ? services.defineTemplateBodyVisitor({
          VElement: visit, VExpressionContainer: visit, VText: visit,
        }, listeners)
      : listeners;
  },
};

function matches(context: Rule.RuleContext, node: ProhibitionNode, check: MustNotCheck): boolean {
  if ('package' in check) {
    return packageMatch(context, node, check);
  }

  if ('global' in check) {
    return node.name === check.global
      && globalReference(context, node);
  }

  if ('call' in check) {
    return node.type === 'CallExpression' && terminalName(child(node, 'callee')) === check.call;
  }

  return capabilityMatch(context, node, check.capability);
}
