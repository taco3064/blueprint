import type { Rule } from 'eslint';

import { dirSegments } from '../config';
import { modularVerdict, relativeVerdict, resolveSegments } from '../inspect/resolve';

/**
 * Relative imports must stay inside their own folder. This is the lint-side
 * twin of `inspect`'s `relative-escape` finding: both call one
 * `relativeVerdict`, so neither can reach a conclusion the other would not.
 * Sharing resolution *primitives* was the earlier claim and it was not worth
 * anything — two callers can read the same coordinates and still disagree
 * about what they mean, which is exactly what happened. A literal
 * `no-restricted-imports` pattern cannot express this: whether `../x` leaves
 * the folder depends on the importing file's depth, which globs cannot see.
 *
 * A sibling's **entry** is reachable: `../Sibling` is how one folder uses
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
 * string }, root?: string, layers?: false, sourceRoot?: string }` — the
 * per-layer folder layout map and entry filename (`index` when absent), plus
 * `architecture.sourceRoot` (`src` when absent, matching its own documented
 * default — `.` names a project-root layout with no source-root segment at
 * all, and a multi-segment root like `'lib/app'` is legal too). Files outside
 * the source root or outside a declared layer are skipped (the emitted config
 * scopes this rule to layer files anyway).
 *
 * `root` names the feature module the linted files sit in — set only when
 * `emitLint` is compiling a modular blueprint. Without it the segment math is
 * off by one under a modular structure: `segments[0]` would be the module,
 * not the layer. Set, the layer model applies to what is left after the
 * module name, and a relative path landing in a *different* module is its own
 * verdict — another module has exactly one reachable point, its entry, and
 * only the alias reaches it.
 *
 * `layers` carries that module's own `layers: false` through verbatim, and
 * `layouts` stays the architecture-wide map beside it: the layer names are
 * declared once for the whole repo, and this says they do not reach inside
 * this module. Without it a folder named after a declared layer is read as
 * that layer — the module is told its own subfolder is a boundary it may not
 * cross relatively, while `emitLint`'s same-module ban forbids the alias the
 * message recommends, and the file has no legal route out at all.
 */
export const relativeEscape: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Relative imports must not leave their folder — use the project alias.',
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
          root: { type: 'string' },
          layers: { enum: [false] },
          sourceRoot: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      escapesSrc: '🚫 Relative import "{{specifier}}" escapes src/ — use the project alias.',
      leavesFolder:
        '🚫 Relative import "{{specifier}}" leaves this layer — use the alias, '
        + 'or extract shared code to a lower layer.',
      leavesModule:
        '🚫 Relative import "{{specifier}}" leaves module "{{module}}" — another module is '
        + 'reachable only at its entry, through the project alias, and only if that module '
        + 'allows this one to import it.',
      reachesInside:
        '🚫 Relative import "{{specifier}}" reaches past a sibling\'s entry — '
        + 'import "{{entry}}" instead; what lives behind it is that folder\'s own business.',
    },
  },
  create(context) {
    const { layouts = {}, entries = {}, root, layers, sourceRoot = 'src' }
      = (context.options[0] as {
        layouts?: Record<string, 'folder' | 'flat'>;
        entries?: Record<string, string>;
        root?: string;
        layers?: false;
        sourceRoot?: string;
      } | undefined) ?? {};

    const segments = srcSegments(context.filename, sourceRoot, context.cwd);

    // Flat, a file outside every declared layer is not this rule's business.
    // Modular, the module is what the file must be inside — the emitted config
    // scopes each entry to one module, so `root` and `segments[0]` agree.
    if (!segments || (root === undefined ? !(segments[0] in layouts) : segments[0] !== root)) {
      return {};
    }

    const layoutOf = (layer: string): 'folder' | 'flat' => layouts[layer] ?? 'flat';
    const entryOf = (layer: string): string => entries[layer] ?? 'index';
    const isLayer = (name: string): boolean => name in layouts;
    const shape = { layoutOf, entryOf, isLayer, layered: layers !== false };
    const dir = segments.slice(0, -1);
    // The layer sits one segment further in once a module is in front of it.
    const layer = segments[root === undefined ? 0 : 1];

    const check = (node: Rule.Node, specifier: string): void => {
      if (!specifier.startsWith('.')) {
        return;
      }

      const target = resolveSegments(dir, specifier);

      const verdict = root === undefined
        ? relativeVerdict(segments, target, shape)
        : modularVerdict(segments, target, shape);

      if (verdict === 'ok') {
        return;
      }

      if (verdict === 'reaches-inside') {
        context.report({
          node,
          messageId: 'reachesInside',
          data: { specifier, entry: entryOf(layer) },
        });

        return;
      }

      if (verdict === 'leaves-module') {
        context.report({
          node,
          messageId: 'leavesModule',
          data: { specifier, module: root as string },
        });

        return;
      }

      context.report({
        node,
        messageId: verdict === 'escapes-src' ? 'escapesSrc' : 'leavesFolder',
        data: { specifier },
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

/**
 * Path segments after the last run that matches `sourceRoot`, or null when
 * not under one. `sourceRoot` can be multi-segment (`'lib/app'`) — the same
 * `dirSegments` normalization `config/graph.ts` already trusts for this field
 * (`aliasLayerRoots`) splits it, and `findLastSubsequence` searches for that
 * whole contiguous run, not just each name appearing somewhere. Zero segments
 * (`'.'`, `'./'`, and `ArchitectureDef.sourceRoot`'s own documented empty
 * case) means a project-root layout with no segment to search for at all
 * (e.g. a Next.js project without `srcDir`). There, the filename's segments
 * ARE the layer-relative segments already: as given, if it is already
 * relative (the low-level `Linter` API used in this rule's own tests passes
 * filenames through unchanged); stripped of the leading `cwd` segments
 * otherwise, which is what real ESLint hands the rule (confirmed against this
 * repo's own `eslint` dependency — `ESLint#lintFiles` resolves every
 * `context.filename` to an absolute path before a rule ever sees it). No
 * "outside cwd" arm: a file ESLint hands to this rule at all has already
 * matched the config's `files` glob against that same `cwd`, so an absolute
 * filename with a different prefix cannot reach here — a mismatch falls
 * through to the same already-relative answer a relative filename gets.
 */
function srcSegments(filename: string, sourceRoot: string, cwd: string): string[] | null {
  const parts = filename.split(/[\\/]/).filter(Boolean);
  const root = dirSegments(sourceRoot);

  if (root.length === 0) {
    const cwdParts = cwd.split(/[\\/]/).filter(Boolean);

    return cwdParts.every((segment, i) => parts[i] === segment)
      ? parts.slice(cwdParts.length)
      : parts;
  }

  const at = findLastSubsequence(parts, root);

  // No second arm for "sourceRoot is the trailing run" — that means the linted path
  // IS exactly the source root, and `slice` then answers `[]`, which the caller
  // already turns away one line later (`segments[0]` is undefined, so no layer
  // claims it). The arm could not decide anything, and its `parts.length - root.length`
  // could not be wrong.
  return at === -1 ? null : parts.slice(at + root.length);
}

/**
 * The start index of the last contiguous occurrence of `needle` in `parts`,
 * or -1. The multi-segment generalization of `Array#lastIndexOf`: a
 * single-segment `needle` behaves identically to `parts.lastIndexOf(needle[0])`.
 */
function findLastSubsequence(parts: string[], needle: string[]): number {
  for (let i = parts.length - needle.length; i >= 0; i--) {
    if (needle.every((segment, j) => parts[i + j] === segment)) {
      return i;
    }
  }

  return -1;
}
