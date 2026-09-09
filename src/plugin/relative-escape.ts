import path from 'node:path';
import type { Rule } from 'eslint';
import { staticImportSpecifier } from './import-reference';
import { relativeVerdict, resolveSegments } from './relative';

export const relativeEscape: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Relative imports must not leave their architectural layer or position.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          layouts: {
            type: 'object',
            additionalProperties: { enum: ['folder', 'file'] },
          },
          entries: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
          sourceRoot: { type: 'string' },
          moduleFirst: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      escapesSrc: '🚫 Relative import "{{specifier}}" escapes {{sourceRoot}} — '
        + 'use the project alias.',
      leavesModule:
        '🚫 Relative import "{{specifier}}" leaves this layer — use the alias, '
        + 'or extract shared code to a lower layer.',
      reachesInside:
        '🚫 Relative import "{{specifier}}" reaches past a sibling\'s entry — '
        + 'import "{{entry}}" instead; what lives behind it is that unit\'s own business.',
    },
  },
  create(context) {
    const { layouts = {}, entries = {}, sourceRoot = 'src', moduleFirst = false }
      = (context.options[0] as {
        layouts?: Record<string, 'folder' | 'file'>;
        entries?: Record<string, string>;
        sourceRoot?: string;
        moduleFirst?: boolean;
      } | undefined) ?? {};

    const cwd = (context as Rule.RuleContext & { cwd: string }).cwd;
    const segments = sourceSegments(context.filename, cwd, sourceRoot);

    const layerIndex = moduleFirst ? 1 : 0;

    const container = isModuleContainer(moduleFirst, segments);

    if (!segments || (!(segments[layerIndex] in layouts) && !container)) {
      return {};
    }

    const layoutOf = (layer: string): 'folder' | 'file' => layouts[layer] ?? 'file';
    const entryOf = (layer: string): string => entries[layer] ?? 'index';
    const isLayer = (name: string): boolean => name in layouts;
    const dir = segments.slice(0, -1);

    const check = (node: Rule.Node, specifier: string): void => {
      if (!specifier.startsWith('.')) {
        return;
      }

      const target = resolveSegments(dir, specifier);

      const verdict = relativeVerdict(segments, target, {
        layoutOf,
        entryOf,
        isLayer,
        moduleFirst,
        container,
      });

      if (verdict === 'ok') {
        return;
      }

      if (verdict === 'reaches-inside') {
        context.report({
          node,
          messageId: 'reachesInside',
          data: { specifier, entry: entryOf(segments[layerIndex]) },
        });

        return;
      }

      context.report({
        node,
        messageId: verdict === 'escapes-src' ? 'escapesSrc' : 'leavesModule',
        data: {
          specifier,
          sourceRoot: sourceRoot === '.' ? 'the project root' : `${sourceRoot}/`,
        },
      });
    };

    const fromSource = (node: Rule.Node): void => {
      const { source } = node as { source?: Rule.Node & { type?: string; value?: unknown } | null };

      if (!source) {
        return;
      }

      const specifier = node.type === 'ImportExpression'
        ? staticImportSpecifier(source as never, context.sourceCode.getScope(source))
        : source.value as string;

      if (specifier !== null) {
        check(node, specifier);
      }
    };

    return {
      ImportDeclaration: fromSource,
      ExportNamedDeclaration: fromSource,
      ExportAllDeclaration: fromSource,
      ImportExpression: fromSource,
    };
  },
};

function isModuleContainer(moduleFirst: boolean, segments: string[] | null): boolean {
  return moduleFirst && (segments?.length === 2 || segments?.[0] === 'app');
}

export function sourceSegments(
  filename: string,
  cwd: string,
  sourceRoot: string,
): string[] | null {
  const relative = path.isAbsolute(filename) ? path.relative(cwd, filename) : filename;
  const parts = relative.split(/[\\/]/).filter((part) => part !== '' && part !== '.');
  const root = sourceRoot.split(/[\\/]/).filter((part) => part !== '' && part !== '.');

  if (!root.length) {
    return parts[0] === '..' ? null : parts;
  }

  for (let at = parts.length - root.length; at >= 0; at -= 1) {
    if (root.every((part, index) => parts[at + index] === part)) {
      return parts.slice(at + root.length);
    }
  }

  return null;
}
