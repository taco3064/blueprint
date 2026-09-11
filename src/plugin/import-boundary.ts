import type { Rule } from 'eslint';

import { resolveArchitecture } from '../config';
import type {
  ArchitectureDef,
  ResolvedImportReference,
  ResolvedSourcePosition,
} from '../config';
import { staticImportSpecifier } from './import-reference';
import { sourceSegments } from './relative-escape';

export const importBoundary: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Architectural boundaries use the canonical alias and apply to dynamic imports.',
    },
    schema: [{ type: 'object', additionalProperties: true }],
    messages: {
      canonical: '🚫 "{{specifier}}" crosses an architectural boundary through a secondary '
        + 'alias. Use the canonical source-root spelling "{{canonical}}".',
      flow: '🚫 "{{specifier}}" violates {{reason}}.',
      sameLayer: '🚫 Same-layer import "{{specifier}}" via an alias — use a relative path or '
        + 'extract to a lower layer.',
      deepImport: '🚫 "{{specifier}}" reaches inside a unit — import it through its entry.',
    },
  },
  create(context) {
    const architecture = (context.options[0] as { architecture?: ArchitectureDef } | undefined)
      ?.architecture;

    if (!architecture) {
      return {};
    }

    const resolved = resolveArchitecture(architecture);
    const cwd = (context as Rule.RuleContext & { cwd: string }).cwd;
    const importerSegments = sourceSegments(context.filename, cwd, resolved.sourceRoot);
    const importer = importerSegments ? resolved.classify(importerSegments) : null;

    if (!importerSegments || !importer) {
      return {};
    }

    const checkCanonical = (node: Rule.Node, specifier: string): void => {
      const reference = resolved.resolveImport(importerSegments, specifier);

      if (needsCanonical(reference, importer)) {
        context.report({
          node,
          messageId: 'canonical',
          data: { specifier, canonical: reference.canonicalSpecifier! },
        });
      }
    };

    const checkDynamic = (node: Rule.Node): void => {
      const source = (node as Rule.Node & { source: Rule.Node }).source;

      const specifier = staticImportSpecifier(
        source as never,
        context.sourceCode.getScope(source),
      );

      if (specifier === null) {
        return;
      }

      const reference = resolved.resolveImport(importerSegments, specifier);

      checkCanonical(node, specifier);

      if (reference.kind === 'relative') {
        return;
      }

      if (isSameLayerAlias(reference, importer)) {
        context.report({ node, messageId: 'sameLayer', data: { specifier } });
      }

      if (isDeepFolderImport(reference)) {
        context.report({ node, messageId: 'deepImport', data: { specifier } });
      }

      if (reference.dependency?.allowed === false) {
        const reasons = [
          reference.dependency.module ? null : 'the module dependency graph',
          reference.dependency.inner ? null : 'the inner dependency flow',
        ].filter((reason): reason is string => reason !== null);

        context.report({
          node,
          messageId: 'flow',
          data: { specifier, reason: reasons.join(' and ') },
        });
      }
    };

    const checkStatic = (node: Rule.Node): void => {
      const source = (node as Rule.Node & { source?: { value?: unknown } | null }).source;

      if (typeof source?.value === 'string') {
        checkCanonical(node, source.value);
      }
    };

    return {
      ImportDeclaration: checkStatic,
      ExportNamedDeclaration: checkStatic,
      ExportAllDeclaration: checkStatic,
      ImportExpression: checkDynamic,
    };
  },
};

function needsCanonical(
  reference: ResolvedImportReference,
  importer: ResolvedSourcePosition,
): boolean {
  return importer.kind !== 'source-root'
    && reference.kind === 'additional-alias'
    && reference.crossesBoundary;
}

function isSameLayerAlias(
  reference: ResolvedImportReference,
  importer: ResolvedSourcePosition,
): boolean {
  const target = reference.target;

  return target !== null
    && 'layer' in importer
    && 'layer' in target
    && importer.module?.name === target.module?.name
    && importer.layer.name === target.layer.name;
}

function isDeepFolderImport(reference: ResolvedImportReference): boolean {
  const target = reference.target;
  const segments = reference.targetSegments;

  return target?.kind === 'unit'
    && target.layer.unit.layout === 'folder'
    && segments!.length > (target.module === null ? 2 : 3);
}
