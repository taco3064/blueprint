import type { Rule } from 'eslint';
import { moduleKey, resolveSegments } from '../inspect/resolve';

/**
 * Relative imports must stay inside their own module. This is the lint-side
 * twin of `inspect`'s `relative-escape` finding — it shares the same
 * resolution primitives, so the two gates can never disagree. A literal
 * `no-restricted-imports` pattern cannot express this: whether `../x` leaves
 * the module depends on the importing file's depth, which globs cannot see.
 *
 * Options: `{ layouts: { [layer]: 'folder' | 'flat' } }` — the per-layer
 * module layout map. Files outside `src/` or outside a declared layer are
 * skipped (the emitted config scopes this rule to layer files anyway).
 */
export const relativeEscape: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Relative imports must not leave their module — use the project alias.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          layouts: {
            type: 'object',
            additionalProperties: { enum: ['folder', 'flat'] },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      escapesSrc: '🚫 Relative import "{{specifier}}" escapes src/ — use the project alias.',
      leavesModule:
        '🚫 Relative import "{{specifier}}" leaves this module — use the alias, '
        + 'or extract shared code to a lower layer.',
    },
  },
  create(context) {
    const { layouts = {} }
      = (context.options[0] as { layouts?: Record<string, 'folder' | 'flat'> } | undefined) ?? {};

    const segments = srcSegments(context.filename);

    if (!segments || !(segments[0] in layouts)) return {};

    const layoutOf = (layer: string): 'folder' | 'flat' => layouts[layer] ?? 'flat';
    const own = moduleKey(segments, layoutOf);
    const dir = segments.slice(0, -1);

    const check = (node: Rule.Node, specifier: string): void => {
      if (!specifier.startsWith('.')) return;

      const target = resolveSegments(dir, specifier);

      if (target === null) {
        context.report({ node, messageId: 'escapesSrc', data: { specifier } });
      } else if (moduleKey(target, layoutOf) !== own) {
        context.report({ node, messageId: 'leavesModule', data: { specifier } });
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

/** Path segments after the last `src/` directory, or null when not under one. */
function srcSegments(filename: string): string[] | null {
  const parts = filename.split(/[\\/]/).filter(Boolean);
  const at = parts.lastIndexOf('src');

  return at === -1 || at === parts.length - 1 ? null : parts.slice(at + 1);
}
