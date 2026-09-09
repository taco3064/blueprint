import path from 'node:path';
import type { Rule } from 'eslint';
import type {
  ArchitectureDef,
  ResolvedArchitecture,
  ResolvedPosition,
} from '../config';
import { resolveArchitecture } from '../config';
import { resolveSegments } from './relative';

interface RelativeProblem {
  messageId: 'escapesSrc' | 'leavesLayer' | 'reachesInside';
  data: Record<string, string>;
}

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
    const own = ownSegments ? resolved.classify(ownSegments) : null;

    if (!ownSegments || !own?.layer || own.inner !== 'layer') {
      return {};
    }

    const dir = ownSegments.slice(0, -1);

    const check = (node: Rule.Node, specifier: string): void => {
      const problem = relativeProblem(resolved, own, dir, specifier);

      if (problem) {
        context.report({ node, ...problem });
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

function relativeProblem(
  resolved: ResolvedArchitecture,
  own: ResolvedPosition,
  dir: string[],
  specifier: string,
): RelativeProblem | null {
  if (!specifier.startsWith('.')) {
    return null;
  }

  const targetSegments = resolveSegments(dir, specifier);

  if (targetSegments === null) {
    return {
      messageId: 'escapesSrc',
      data: { specifier, sourceRoot: sourceRootLabel(resolved.sourceRoot) },
    };
  }

  const target = resolved.classify(targetSegments);

  if (resolved.moduleFirst && moduleName(own) !== moduleName(target)) {
    return null;
  }

  if (!target.layer || target.layer.name !== own.layer?.name) {
    return { messageId: 'leavesLayer', data: { specifier } };
  }

  if (target.layer.unit.layout === 'file' || target.unit === own.unit) {
    return null;
  }

  return reachesPastEntry(resolved, target)
    ? {
        messageId: 'reachesInside',
        data: { specifier, entry: target.layer.unit.entry },
      }
    : null;
}

function reachesPastEntry(
  resolved: ResolvedArchitecture,
  target: ResolvedPosition,
): boolean {
  if (!target.layer) {
    return false;
  }

  const insideLayer = resolved.moduleFirst
    ? target.path.slice(2)
    : target.path.slice(1);

  const entry = target.layer.unit.entry;

  return insideLayer.length > 2
    || (insideLayer.length === 2 && stripExtension(insideLayer[1]) !== entry);
}

function moduleName(position: ResolvedPosition): string | null {
  return position.module?.name ?? null;
}

function sourceRootLabel(sourceRoot: string): string {
  return sourceRoot === '.' ? 'the project root' : `${sourceRoot}/`;
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

function stripExtension(value: string): string {
  return value.replace(/\.[^.]+$/, '');
}
