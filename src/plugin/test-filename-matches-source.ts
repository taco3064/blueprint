import fs from 'node:fs';
import path from 'node:path';
import type { Rule } from 'eslint';

const SRC_EXT = ['.js', '.ts', '.jsx', '.tsx', '.vue', '.mjs'];
const TEST_SUFFIX = /\.(test|spec)\.[jt]sx?$/;

/**
 * A `*.test.*` / `*.spec.*` file must sit next to a same-named source file.
 * Tests are co-located and named after what they test; an orphan test file
 * means the source moved, was renamed, or the test tests nothing real.
 */
export const testFilenameMatchesSource: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'A test file must have a co-located, same-named source sibling.',
    },
    schema: [],
    messages: {
      orphan:
        '🚫 No sibling source found for "{{base}}" — co-locate the test next to its '
        + 'source and keep the names aligned.',
    },
  },
  create(context) {
    return {
      Program(node) {
        if (!TEST_SUFFIX.test(context.filename)) return;

        const dir = path.dirname(context.filename);
        const base = path.basename(context.filename).replace(TEST_SUFFIX, '');
        const found = SRC_EXT.some((ext) => fs.existsSync(path.join(dir, base + ext)));

        if (!found) context.report({ node, messageId: 'orphan', data: { base } });
      },
    };
  },
};
