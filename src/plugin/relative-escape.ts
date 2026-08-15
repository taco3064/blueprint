import type { Rule } from 'eslint';
import { relativeVerdict, resolveSegments, sourceRootName, stripSourceRoot } from '../boundary';

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
 * Options: `{ layouts: { [layer]: 'folder' | 'file' }, entries: { [layer]:
 * string }, depth, sourceRoot }` — the per-layer module layout map, the entry
 * filename (`index` when absent), the segment position the layer sits at, and
 * the source root the coordinates are counted from (`src` when absent). Files
 * outside that root, or outside a declared layer, are skipped (the emitted
 * config scopes this rule to layer files anyway).
 */
/**
 * Verdict → message id, for the four that are reported without extra data.
 * A map rather than a chain: five verdicts reach here and a fallthrough
 * `else` would hand the newest one an older verdict's sentence.
 */
const MESSAGE_OF = {
  // `escapes-src` is answered by the null-target test before the lookup, so
  // this entry is what keeps the two consistent if that ever moves — not a
  // second path to the same report.
  'escapes-src': 'escapesSrc',
  'leaves-layer': 'leavesLayer',
  'leaves-module': 'leavesModule',
  'reaches-root': 'reachesRoot',
} as const;

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
            additionalProperties: { enum: ['folder', 'file'] },
          },
          entries: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
          depth: {
            type: 'integer',
            minimum: 0,
          },
          sourceRoot: {
            type: 'string',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      escapesSrc: '🚫 Relative import "{{specifier}}" escapes {{root}} — use the project alias.',
      leavesLayer:
        '🚫 Relative import "{{specifier}}" leaves this layer — use the alias, '
        + 'or extract shared code to a lower layer.',
      leavesModule:
        '🚫 Relative import "{{specifier}}" leaves this module — cross a module '
        + 'boundary through the alias, and declare the dependency in `imports`; '
        + 'a relative path cannot express it.',
      reachesRoot:
        '🚫 Relative import "{{specifier}}" reaches up to the module root — the root '
        + 'composes the layers, so nothing inside one may import back up to it. Move '
        + 'the shared part into a layer, or pass it in from the root.',
      reachesInside:
        '🚫 Relative import "{{specifier}}" reaches past a sibling\'s entry — '
        + 'import "{{entry}}" instead; what lives behind it is that unit\'s own business.',
    },
  },
  create(context) {
    const { layouts = {}, entries = {}, depth = 0, sourceRoot = 'src' }
      = (context.options[0] as {
        layouts?: Record<string, 'folder' | 'file'>;
        entries?: Record<string, string>;
        depth?: number;
        sourceRoot?: string;
      } | undefined) ?? {};

    const segments = stripSourceRoot(context.filename, sourceRoot, Object.keys(layouts), depth);

    // Null covers both ways a file can be outside what this rule speaks about:
    // no position under the source root, and a position whose segment at
    // `depth` names no declared layer — which is what a module tree read at
    // depth 0 produces, since the module name is not a layer. Silence, not a
    // verdict.
    if (!segments) return {};

    const layoutOf = (layer: string): 'folder' | 'file' => layouts[layer] ?? 'file';
    const entryOf = (layer: string): string => entries[layer] ?? 'index';
    const dir = segments.slice(0, -1);
    const root = sourceRootName(sourceRoot);

    const check = (node: Rule.Node, specifier: string): void => {
      if (!specifier.startsWith('.')) return;

      const target = resolveSegments(dir, specifier);

      const verdict = relativeVerdict(segments, target, layoutOf, entryOf, depth);

      if (verdict === 'ok') return;

      // The same condition the verdict reports as `escapes-src`, tested here as
      // itself: past this point the target resolved, which is what lets the
      // message below name a segment of it.
      //
      // undecidable: removing this block falls through to `MESSAGE_OF`, which
      // maps `escapes-src` to the same report. That is what the entry is for.
      // `inspect`'s half of the check is NOT equivalent — it has no such
      // fallback, so dropping it there produces a wrong finding.
      if (target === null) {
        context.report({ node, messageId: 'escapesSrc', data: { specifier, root } });

        return;
      }

      if (verdict === 'reaches-inside') {
        // The entry named is the TARGET's layer, which is the importer's own
        // for a sibling and deliberately not for the module root reaching
        // down into a layer it does not belong to.
        context.report({
          node,
          messageId: 'reachesInside',
          data: { specifier, entry: entryOf(target[depth]) },
        });

        return;
      }

      context.report({ node, messageId: MESSAGE_OF[verdict], data: { specifier, root } });
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
