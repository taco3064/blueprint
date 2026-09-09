import path from 'node:path';
import type { Rule } from 'eslint';
import type { ArchitectureDef } from '../config';
import { resolveArchitecture } from '../config';
import { resolveSegments } from './relative';

export const relativeEscape: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Relative imports preserve the resolved module/layer/unit boundary.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          architecture: { type: 'object', additionalProperties: true },
        },
        required: ['architecture'],
        additionalProperties: false,
      },
    ],
    messages: {
      escapesSrc: '🚫 Relative import "{{specifier}}" escapes {{sourceRoot}} — '
        + 'use the project alias.',
      leavesLayer:
        '🚫 Relative import "{{specifier}}" leaves this layer — use the alias, '
        + 'or extract shared code to a lower layer.',
      reachesInside:
        '🚫 Relative import "{{specifier}}" reaches past a sibling unit entry — '
        + 'import "{{entry}}" instead.',
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
    const ownSegments = sourceSegments(context.filename, cwd, resolved.sourceRoot);

    if (!ownSegments) {
      return {};
    }

    const own = resolved.classify(ownSegments);

    if (!own.layer || own.inner !== 'layer') {
      return {};
    }

    const dir = ownSegments.slice(0, -1);

    const check = (node: Rule.Node, specifier: string): void => {
      if (!specifier.startsWith('.')) {
        return;
      }

      const targetSegments = resolveSegments(dir, specifier);

      if (targetSegments === null) {
        context.report({
          node,
          messageId: 'escapesSrc',
          data: {
            specifier,
            sourceRoot: resolved.sourceRoot === '.' ? 'the project root' : `${resolved.sourceRoot}/`,
          },
        });

        return;
      }

      const target = resolved.classify(targetSegments);
      const ownModule = own.module?.name ?? null;
      const targetModule = target.module?.name ?? null;

      // #435 owns the cross-module relative-import policy. #434 preserves the
      // existing inner layer/unit rule without inventing a new outer boundary.
      if (resolved.moduleFirst && ownModule !== targetModule) {
        return;
      }

      if (!target.layer || target.layer.name !== own.layer.name) {
        context.report({ node, messageId: 'leavesLayer', data: { specifier } });

        return;
      }

      if (own.layer.unit.layout === 'file' || target.unit === own.unit) {
        return;
      }

      const insideLayer = resolved.moduleFirst
        ? target.path.slice(2)
        : target.path.slice(1);
      const entry = own.layer.unit.entry;
      const atEntry = insideLayer.length === 1
        || (insideLayer.length === 2 && stripExtension(insideLayer[1]) === entry);

      if (!atEntry) {
        context.report({ node, messageId: 'reachesInside', data: { specifier, entry } });
      }
    };

    const fromSource = (node: Rule.Node): void => {
      const { source } = node as { source?: { type?: string; value?: unknown } | null };

      if (source?.type === 'Literal' && typeof source.value === 'string') {
        check(node, source.value);
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

function stripExtension(value: string): string {
  return value.replace(/\.[^.]+$/, '');
}
