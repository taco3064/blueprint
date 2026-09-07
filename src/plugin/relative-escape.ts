import path from 'node:path';
import type { Rule } from 'eslint';
import { relativeVerdict, resolveSegments } from './relative';

/**
 * Relative imports must stay inside their own module. This is the lint-side
 * twin of `inspect`'s `relative-escape` finding: both call one
 * `relativeVerdict`, so neither can reach a conclusion the other would not.
 * Sharing resolution *primitives* was the earlier claim and it was not worth
 * anything — two callers can read the same coordinates and still disagree
 * about what they mean, which is exactly what happened. A literal
 * `no-restricted-imports` pattern cannot express this: whether `../x` leaves
 * the module depends on the importing file's depth, which globs cannot see.
 *
 * A sibling's **entry** is reachable: `../Sibling` is how one module uses
 * another inside the same layer, and it is the only way — the alias form
 * (`~app/{ownLayer}/Sibling`) stays banned, so same-layer edges have exactly
 * one shape. What stays banned is reaching *past* that entry
 * (`../Sibling/internals`), which is the import that couples to a decision
 * the sibling did not publish.
 *
 * Banning the entry too was the earlier reading, and it left a folder-layout
 * layer with no legal way to share at all — the only advice left was "extract
 * to a lower layer", which is how a `utils/` junk drawer gets built one
 * honest decision at a time.
 *
 * Options: `{ layouts: { [layer]: 'folder' | 'flat' }, entries: { [layer]:
 * string } }` — the per-layer module layout map and entry filename
 * (`index` when absent). Files outside `src/` or outside a declared layer are
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
          entries: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
          sourceRoot: { type: 'string' },
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
        + 'import "{{entry}}" instead; what lives behind it is that module\'s own business.',
    },
  },
  create(context) {
    const { layouts = {}, entries = {}, sourceRoot = 'src' }
      = (context.options[0] as {
        layouts?: Record<string, 'folder' | 'flat'>;
        entries?: Record<string, string>;
        sourceRoot?: string;
      } | undefined) ?? {};

    const cwd = (context as Rule.RuleContext & { cwd: string }).cwd;
    const segments = sourceSegments(context.filename, cwd, sourceRoot);

    if (!segments || !(segments[0] in layouts)) {
      return {};
    }

    const layoutOf = (layer: string): 'folder' | 'flat' => layouts[layer] ?? 'flat';
    const entryOf = (layer: string): string => entries[layer] ?? 'index';
    const dir = segments.slice(0, -1);

    const check = (node: Rule.Node, specifier: string): void => {
      if (!specifier.startsWith('.')) {
        return;
      }

      const target = resolveSegments(dir, specifier);

      const verdict = relativeVerdict(segments, target, { layoutOf, entryOf });

      if (verdict === 'ok') {
        return;
      }

      if (verdict === 'reaches-inside') {
        context.report({
          node,
          messageId: 'reachesInside',
          data: { specifier, entry: entryOf(segments[0]) },
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
