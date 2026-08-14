import type { Rule } from 'eslint';
import { crossModuleTarget } from '../inspect/resolve';

/**
 * A module must not re-export another module's public surface verbatim.
 *
 * `no-restricted-imports` catches `export { attack } from '~app/Combat'`,
 * because that one is a specifier. It cannot catch the same effect written as
 * two statements — an import bound to a local, then that local exported — and
 * banning only the spelling a pattern reaches makes the other spelling a free
 * workaround. So this follows the *binding*, not the path.
 *
 * Both callers share `crossModuleTarget` with `inspect`'s `module-reexport`
 * finding, for the reason `relative-escape` states in its own doc: two callers
 * reading the same coordinates can still disagree about what they mean.
 *
 * **A wrapper is deliberately not banned.** A module entry exposing
 * `startGame()` that calls into a declared dependency is composition, and no
 * static tool can separate a domain abstraction from a pass-through. The
 * guarantee is stated at the width it holds — another module's public surface
 * cannot be re-exported *verbatim* — and the message names the non-fix, since
 * wrapping a forward in a function clears this rule and builds nothing.
 *
 * Relative specifiers are not read here: a relative path that leaves the module
 * is `blueprint/relative-escape`'s `leaves-module`, and reporting it twice
 * would make one edit answer to two rules.
 *
 * Options: `{ aliases: string[], modules: string[], module: string }` — the
 * alias bases, every declared module name, and the module this entry governs.
 */
export const noModuleReexport: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'A module must not re-export another module\'s public surface.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          aliases: { type: 'array', items: { type: 'string' } },
          modules: { type: 'array', items: { type: 'string' } },
          module: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      passThrough:
        '🚫 Re-exports "{{target}}" through this module\'s own surface. A consumer that needs '
        + '"{{target}}" declares it in its own `imports`; this module should expose its own API '
        + 'instead of forwarding someone else\'s. Wrapping the call in a function that only '
        + 'forwards it satisfies this rule and buys nothing — a wrapper is right when it '
        + 'expresses this module\'s own responsibility, and otherwise the consumer should '
        + 'declare the original module.',
    },
  },
  create(context) {
    const { aliases = [], modules = [], module = '' }
      = (context.options[0] as {
        aliases?: string[];
        modules?: string[];
        module?: string;
      } | undefined) ?? {};

    /** Local binding name → the module its import came from. */
    const imported = new Map<string, string>();

    const targetOf = (specifier: unknown): string | null =>
      typeof specifier === 'string'
        ? crossModuleTarget(specifier, aliases, modules, module)
        : null;

    const report = (node: Rule.Node, target: string): void => {
      context.report({ node, messageId: 'passThrough', data: { target } });
    };

    /**
     * The name a node binds, or undefined when it binds none — `export default
     * 1` and `export default attack` are the two arms, and the specifier loop
     * below reuses it rather than repeating a test that can only be true there.
     */
    const identifier = (node: { type: string }): string | undefined =>
      (node.type === 'Identifier' ? (node as unknown as { name: string }).name : undefined);

    /** An export with no `source` — the two-statement spelling. */
    const fromBinding = (node: Rule.Node, local: { type: string }): void => {
      const name = identifier(local);
      const target = name === undefined ? undefined : imported.get(name);

      if (target !== undefined) report(node, target);
    };

    return {
      ImportDeclaration(node) {
        const { source, specifiers } = node;
        const target = targetOf(source.value);

        if (target === null) return;

        // Every specifier shape binds a local the same way — named, default,
        // and `import * as combat` alike — so one loop covers all three, and
        // a rename is followed rather than matched by name.
        for (const specifier of specifiers) imported.set(specifier.local.name, target);
      },

      ExportAllDeclaration(node) {
        const target = targetOf(node.source?.value);

        if (target !== null) report(node as Rule.Node, target);
      },

      ExportNamedDeclaration(node) {
        const target = targetOf(node.source?.value);

        if (target !== null) {
          report(node as Rule.Node, target);

          return;
        }

        // `export { attack }` after an import of it: same effect, two
        // statements. The local is what carries the link, so `export { attack
        // as go }` and `import { attack as ca } … export { ca }` are both this.
        if (node.source) return;

        // Only a source-less export reaches here, so `local` is always an
        // identifier — a string module name (`export { "a" as b }`) is legal
        // only WITH a source, which returned above.
        for (const specifier of node.specifiers) {
          fromBinding(specifier as unknown as Rule.Node, specifier.local);
        }
      },

      ExportDefaultDeclaration(node) {
        const { declaration } = node;

        fromBinding(node as Rule.Node, declaration);
      },
    };
  },
};
