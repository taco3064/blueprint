import ignore from 'ignore';
import type { Rule } from 'eslint';
import type { MustNotCheck } from '../config';
import { moduleSpecifier, staticImportSpecifier } from './import-reference';
import { child, nodeName } from './must-not-bindings';
import type { ProhibitionNode } from './must-not-bindings';

export function packageFamily(specifier: string, name: string): boolean {
  return specifier === name || specifier.startsWith(`${name}/`);
}

export function packageMatch(
  context: Rule.RuleContext,
  node: ProhibitionNode,
  check: Extract<MustNotCheck, { package: string }>,
): boolean {
  const source = moduleSpecifier(node, context.sourceCode.getScope(node as Rule.Node));

  if (!source) {
    return false;
  }

  const specifier = staticImportSpecifier(
    source, context.sourceCode.getScope(source as unknown as Rule.Node),
  );

  if (specifier === null || !(check.pattern
    ? ignore({ allowRelativePaths: true }).add(check.package).ignores(specifier)
    : packageFamily(specifier, check.package))) {
    return false;
  }

  if (!check.imports) {
    return true;
  }

  if (node.type === 'ExportAllDeclaration') {
    return true;
  }

  if (!['ImportDeclaration', 'ExportNamedDeclaration'].includes(node.type)) {
    return false;
  }

  return (node.specifiers as ProhibitionNode[]).some((entry) => {
    const name = entry.type === 'ImportSpecifier'
      ? nodeName(child(entry, 'imported'))
      : entry.type === 'ExportSpecifier'
        ? nodeName(child(entry, 'local'))
        : entry.type === 'ImportDefaultSpecifier' ? 'default' : '*';

    return name === '*' || check.imports!.includes(name!);
  });
}
