import type { Rule } from 'eslint';
import type { ResolvedImportReference } from '../config';

export function checkImportFlow(
  context: Rule.RuleContext,
  node: Rule.Node,
  input: { specifier: string; reference: ResolvedImportReference },
): void {
  const { specifier, reference } = input;

  if (reference.dependency?.allowed !== false) {
    return;
  }

  const reasons = [
    reference.dependency.module ? null : 'the module dependency graph',
    reference.dependency.inner ? null : 'the inner dependency flow',
  ].filter((reason): reason is string => reason !== null);

  context.report({
    node, messageId: 'flow', data: { specifier, reason: reasons.join(' and ') },
  });
}

export function checkRootImport(
  context: Rule.RuleContext,
  node: Rule.Node,
  input: { specifier: string; reference: ResolvedImportReference; alias: string },
): boolean {
  const { specifier, reference, alias } = input;
  const root = reference.rootUnit;

  if (root === null) {
    return false;
  }

  if (root.sameUnit) {
    if (reference.kind !== 'relative') {
      context.report({ node, messageId: 'rootAlias', data: { specifier } });
    }

    return true;
  }

  const canonical = `${alias}/${root.target.module.name}`;

  if (!root.bare) {
    context.report({
      node, messageId: 'rootPrivate', data: {
        specifier,
        advice: reference.dependency?.allowed === false
          ? ''
          : ` Import "${canonical}" instead.`,
      },
    });
  } else if (reference.kind === 'relative') {
    context.report({ node, messageId: 'rootCanonical', data: { specifier, canonical } });
  }

  checkImportFlow(context, node, { specifier, reference });

  return true;
}
