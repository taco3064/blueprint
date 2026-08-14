import type { Rule } from 'eslint';
import { addressesModuleRoot, stripAlias } from '../boundary';

/**
 * Nothing inside a layer may reach up to its own module root, at any spelling.
 *
 * `no-restricted-imports` closes two of them and structurally cannot close the
 * rest: a pattern **group** is gitignore-matched, so `~app/Fighter` bans
 * `~app/Fighter/hooks/useX` too and cuts the module off from its own layers;
 * and **`paths`** entries match a specifier exactly, so they carry the two names
 * a config knows — the module folder and `index` — and never a root component's
 * filename the config has never seen.
 *
 * That filename is the likely spelling rather than the exotic one. The RFC
 * settles that a module exporting a single component takes that component's
 * name, so `Fighter/Fighter.tsx` is what a module root is *called*, and
 * `~app/Fighter/Fighter` is what an agent writes to reach it.
 *
 * Both callers share `addressesModuleRoot` with `inspect`'s `root-import`
 * finding, for the reason `relative-escape` states in its own doc: restating the
 * condition here would make two sources of truth that agree today.
 *
 * Only alias specifiers are read. A relative path that climbs to the root is
 * `blueprint/relative-escape`'s `reaches-root`, and reporting it twice would
 * make one edit answer to two rules.
 *
 * Options: `{ aliases: string[], layers: string[], module: string, depth: number }`
 * — the alias bases, the declared layer names, the module this entry governs,
 * and the offset the layer sits at. Emitted only on a module's LAYER entries, so
 * a module root file never reaches this rule: it composes the layers and may
 * reach every one of them.
 */
export const noModuleRootImport: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Nothing inside a layer may import its own module root.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          aliases: { type: 'array', items: { type: 'string' } },
          layers: { type: 'array', items: { type: 'string' } },
          module: { type: 'string' },
          depth: { type: 'integer', minimum: 0 },
        },
        required: ['aliases', 'layers', 'module', 'depth'],
        additionalProperties: false,
      },
    ],
    messages: {
      // Says the same thing `inspect` and the two `no-restricted-imports`
      // spellings say, so an adopter meeting it in any gate reads one rule.
      reachesRoot:
        '🚫 "{{specifier}}" reaches up to the module root — the root composes the layers, so '
        + 'nothing inside one may import back up to it. Move the shared part down into a layer, '
        + 'or pass it in from the root.',
    },
  },
  create(context) {
    const options = context.options[0] as {
      aliases: string[];
      layers: string[];
      module: string;
      depth: number;
    } | undefined;

    // No option block means no module to be the root of, and a rule with
    // nothing to judge registers no visitors rather than running on defaults
    // that would answer "legal" to everything. emitLint only ever emits this
    // rule with the block, so this arm belongs to a hand-written config.
    if (!options) return {};

    // No per-field defaults, and the schema requires all four: a block missing
    // `aliases` would leave nothing for `stripAlias` to match and the rule would
    // govern nothing while resolving cleanly. Half a block is the same silent
    // failure as no block, so it is refused rather than filled in.
    const { aliases, layers, module, depth } = options;

    const check = (node: Rule.Node, specifier: string): void => {
      const parts = stripAlias(specifier, aliases);

      if (!parts || !addressesModuleRoot(parts, module, layers, depth)) return;

      context.report({ node, messageId: 'reachesRoot', data: { specifier } });
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
