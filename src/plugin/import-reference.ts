import { getInnermostScope, getStaticValue } from '@eslint-community/eslint-utils';
import tsParser from '@typescript-eslint/parser';
import type { Scope } from 'eslint';
import vueParser from 'vue-eslint-parser';

interface AstNode {
  type: string;
  [key: string]: unknown;
}

interface ParsedSource {
  ast: AstNode;
  scopeManager: {
    globalScope: Scope.Scope | null;
  };
  visitorKeys: Record<string, string[]>;
}

export interface DynamicImportAnalysis {
  specifiers: string[];
  unknown: number;
  parseError?: string;
}

const vueJsxParser = {
  parseForESLint(
    source: string,
    options: Parameters<typeof tsParser.parseForESLint>[1],
  ): ReturnType<typeof tsParser.parseForESLint> {
    return tsParser.parseForESLint(source, { ...options, jsx: true });
  },
};

const vueScriptParsers = {
  js: tsParser,
  jsx: vueJsxParser,
  ts: tsParser,
  tsx: vueJsxParser,
  '<template>': tsParser,
};

export function staticImportSpecifier(node: AstNode, scope: Scope.Scope | null): string | null {
  const found = getStaticValue(node as never, scope);

  return typeof found?.value === 'string' ? found.value : null;
}

export function analyzeDynamicImports(
  source: string,
  filePath = 'source.js',
): DynamicImportAnalysis {
  let parsed: ParsedSource;

  try {
    parsed = parseSource(source, filePath);
  } catch (error) {
    return {
      specifiers: [],
      unknown: 0,
      parseError: String(error),
    };
  }

  const result: DynamicImportAnalysis = { specifiers: [], unknown: 0 };
  const globalScope = parsed.scopeManager.globalScope;

  walk(parsed.ast, parsed.visitorKeys, (node) => {
    if (node.type !== 'ImportExpression') {
      return;
    }

    const sourceNode = node.source as AstNode;
    const scope = getInnermostScope(globalScope!, sourceNode as never);
    const specifier = staticImportSpecifier(sourceNode, scope);

    if (specifier === null) {
      result.unknown++;
    } else {
      result.specifiers.push(specifier);
    }
  });

  return result;
}

function parseSource(source: string, filePath: string): ParsedSource {
  const options = {
    // Stryker disable next-line BooleanLiteral: dependency discovery ignores parser comments.
    comment: true,
    ecmaVersion: 'latest' as const,
    filePath,
    // Stryker disable next-line Regex: filePath selects JSX/TSX; this mirrors that context.
    jsx: /\.[jt]sx$/.test(filePath),
    // Stryker disable next-line BooleanLiteral: dependency discovery never consumes node locations.
    loc: true,
    // Stryker disable next-line BooleanLiteral: dependency discovery never consumes node ranges.
    range: true,
    sourceType: 'module' as const,
    // Stryker disable next-line BooleanLiteral: dependency discovery never consumes parser tokens.
    tokens: true,
  };

  return (filePath.endsWith('.vue')
    ? vueParser.parseForESLint(source, { ...options, parser: vueScriptParsers })
    : tsParser.parseForESLint(source, options)) as unknown as ParsedSource;
}

function walk(
  node: AstNode,
  visitorKeys: Record<string, string[]>,
  visit: (node: AstNode) => void,
): void {
  visit(node);

  for (const key of visitorKeys[node.type] as string[]) {
    const child = node[key];

    if (Array.isArray(child)) {
      for (const item of child) {
        if (isNode(item)) {
          walk(item, visitorKeys, visit);
        }
      }
    } else if (isNode(child)) {
      walk(child, visitorKeys, visit);
    }
  }
}

function isNode(value: unknown): value is AstNode {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false;
  }

  // Stryker disable next-line ConditionalExpression: parser visitor nodes guarantee string types.
  return typeof value.type === 'string';
}
