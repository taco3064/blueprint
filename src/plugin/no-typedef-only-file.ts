import type { Rule } from 'eslint';

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
