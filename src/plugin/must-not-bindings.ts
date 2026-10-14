import { findVariable } from '@eslint-community/eslint-utils';
import type { Rule } from 'eslint';

export interface ProhibitionNode {
  type: string;
  name?: string;
  value?: unknown;
  parent?: ProhibitionNode;
  [key: string]: unknown;
}

export function child(node: ProhibitionNode, key: string): ProhibitionNode {
  return node[key] as ProhibitionNode;
}

export function nodeName(node: ProhibitionNode): string | null {
  return node.type === 'Identifier'
    ? node.name!
    : typeof node.value === 'string' ? node.value : null;
}

export function terminalName(node: ProhibitionNode): string | null {
  if (node.type === 'Identifier') {
    return node.name!;
  }

  if (node.type !== 'MemberExpression') {
    return null;
  }

  const property = child(node, 'property');

  return node.computed && property.type !== 'Literal' ? null : nodeName(property);
}

export function globalReference(context: Rule.RuleContext, node: ProhibitionNode): boolean {
  const scope = context.sourceCode.getScope(node as Rule.Node);
  const reference = scope.references.find((entry) => entry.identifier === node);

  return reference !== undefined && (!reference.resolved || reference.resolved.defs.length === 0);
}

export function importedIdentity(
  context: Rule.RuleContext,
  node: ProhibitionNode,
): { package: string; name: string } | null {
  if (node.type === 'MemberExpression') {
    const object = importedIdentity(context, child(node, 'object'));
    const name = terminalName(node);

    return object && ['*', 'default'].includes(object.name) && name
      ? { package: object.package, name }
      : null;
  }

  if (node.type !== 'Identifier') {
    return null;
  }

  const variable = findVariable(context.sourceCode.getScope(node as Rule.Node), node as never);
  const definition = variable?.defs.find((entry) => entry.type === 'ImportBinding');

  if (!definition || variable!.references.some((reference) => reference.isWrite())) {
    return null;
  }

  const declaration = definition.parent as unknown as ProhibitionNode;
  const specifier = definition.node as unknown as ProhibitionNode;

  const name = specifier.type === 'ImportSpecifier'
    ? nodeName(child(specifier, 'imported'))!
    : specifier.type === 'ImportDefaultSpecifier' ? 'default' : '*';

  return { package: child(declaration, 'source').value as string, name };
}

export function reactClass(context: Rule.RuleContext, node: ProhibitionNode): boolean {
  let parent = node.parent;

  while (parent && !['ClassDeclaration', 'ClassExpression'].includes(parent.type)) {
    if (parent.type === 'FunctionDeclaration'
      || (parent.type === 'FunctionExpression' && parent.parent?.type !== 'MethodDefinition')) {
      return false;
    }

    parent = parent.parent;
  }

  if (!parent?.superClass) {
    return false;
  }

  const identity = importedIdentity(context, child(parent, 'superClass'));

  return identity?.package === 'react' && ['Component', 'PureComponent'].includes(identity.name);
}
