import fs from 'node:fs';
import path from 'node:path';
import type { Rule } from 'eslint';

const SRC_EXT = ['.js', '.ts', '.jsx', '.tsx', '.vue', '.mjs'];
const TEST_SUFFIX = /\.(test|spec)\.[jt]sx?$/;

interface Options {
  allowAspectSuffix?: boolean;
  suiteRoots?: { directory: string; kind: 'integration' | 'contract' | 'e2e' }[];
}

function sourceExists(dir: string, base: string): boolean {
  if (!fs.existsSync(dir)) {
    return false;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  return SRC_EXT.some((ext) => entries.some((entry) =>
    entry.name === base + ext && entry.isFile(),
  ));
}

function hasSource(dir: string, base: string, allowAspectSuffix: boolean | undefined): boolean {
  const candidates = allowAspectSuffix
    ? base.split('.').map((_, index, segments) => segments.slice(0, index + 1).join('.'))
    : [base];

  return candidates.some((candidate) => candidate !== '' && sourceExists(dir, candidate));
}

export const testFilenameMatchesSource: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'A test file must have a co-located, same-named source sibling.',
    },
    schema: [{
      type: 'object',
      additionalProperties: false,
      properties: {
        allowAspectSuffix: { type: 'boolean' },
        suiteRoots: {
          type: 'array',
          uniqueItems: true,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['directory', 'kind'],
            properties: {
              directory: {
                type: 'string',
                pattern: '^(?!.*(?:^|/)\\.{1,2}(?:/|$))[A-Za-z0-9_-]+(?:/[A-Za-z0-9_.-]+)*$',
              },
              kind: { enum: ['integration', 'contract', 'e2e'] },
            },
          },
        },
      },
    }],
    messages: {
      orphan:
        '🚫 No sibling source found for "{{base}}" — co-locate the test next to its '
        + 'source and keep the names aligned.',
      suite: '🚫 Suite in "{{directory}}" must end in .{{kind}}.test or .{{kind}}.spec '
        + 'before its extension.',
    },
  },
  create(context) {
    const options: Options = context.options[0] ?? {};

    return {
      Program(node) {
        if (!TEST_SUFFIX.test(context.filename)) {
          return;
        }

        const dir = path.dirname(context.filename);
        const base = path.basename(context.filename).replace(TEST_SUFFIX, '');
        const relative = path.relative(context.cwd, context.filename).split(path.sep).join('/');

        const suite = options.suiteRoots?.filter((root) => relative.startsWith(`${root.directory}/`))
          .sort((a, b) => b.directory.length - a.directory.length)[0];

        if (suite) {
          if (!base.endsWith(`.${suite.kind}`) || base === `.${suite.kind}`) {
            context.report({ node, messageId: 'suite', data: suite });
          }

          return;
        }

        if (hasSource(dir, base, options.allowAspectSuffix)) {
          return;
        }

        context.report({ node, messageId: 'orphan', data: { base } });
      },
    };
  },
};
