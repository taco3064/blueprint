import type { Rule } from 'eslint';

/**
 * A file holding only `@typedef` JSDoc and no runtime export is a type junk
 * drawer — the typedef belongs in the file whose `@returns` declares it.
 * JS + JSDoc projects only; the emitter attaches it to `.js` files.
 */
export const noTypedefOnlyFile: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'A file must not contain only @typedef declarations.',
    },
    schema: [],
    messages: {
      typedefOnly:
        '🚫 This file has @typedef but no runtime export — move each typedef into '
        + 'the producer file that declares it via @returns.',
    },
  },
  create(context) {
    let hasRuntimeExport = false;

    return {
      ':matches(ExportNamedDeclaration, ExportDefaultDeclaration, ExportAllDeclaration)'() {
        hasRuntimeExport = true;
      },
      'Program:exit'(node) {
        if (!hasRuntimeExport && /@typedef/.test(context.sourceCode.getText())) {
          context.report({ node, messageId: 'typedefOnly' });
        }
      },
    };
  },
};
